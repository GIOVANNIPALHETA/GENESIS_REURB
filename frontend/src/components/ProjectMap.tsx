import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import {
  FileText,
  DollarSign,
  Search,
  Crosshair,
  Layers,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Filter,
  Eye,
  EyeOff,
  Building,
  Plus,
  Printer,
  Compass,
  Ruler,
  Maximize2,
  Trash2,
  Info,
  ExternalLink,
  MessageCircle,
  MousePointer,
  Hand,
  User,
  MapPin,
  Calendar,
  Edit3
} from 'lucide-react';
import { LotMapDrawer, LotDrawerData } from './LotMapDrawer';
import { BlockManagerModal } from './BlockManagerModal';
import { LotFormModal, LotFormInitialData } from './LotFormModal';
import { EspelhoCadastralModal } from './EspelhoCadastralModal';

export type VisualMode = 'contractual' | 'financial';
export type GISTool = 'nav' | 'identify' | 'measure_dist' | 'measure_area';

interface ProjectMapProps {
  mapData: any;
  projectId: string;
  onRefreshData?: () => void;
}

// Color palette constants
const CONTRACT_COLORS = {
  CONTRACT_SIGNED: { stroke: '#0f766e', fill: '#0d9488', label: 'Contrato assinado' },
  NOT_SIGNED: { stroke: '#475569', fill: '#94a3b8', label: 'Sem contrato' },
  DISTRATTO: { stroke: '#ea580c', fill: '#f97316', label: 'Distrato' },
  UNLINKED: { stroke: '#94a3b8', fill: '#e2e8f0', label: 'Não vinculado' }
};

const FINANCIAL_COLORS = {
  PAID: { stroke: '#15803d', fill: '#22c55e', label: 'Quitado' },
  UP_TO_DATE: { stroke: '#1d4ed8', fill: '#3b82f6', label: 'Em dia (saldo a pagar)' },
  OVERDUE: { stroke: '#b91c1c', fill: '#ef4444', label: 'Em atraso' },
  NO_CHARGES: { stroke: '#475569', fill: '#94a3b8', label: 'Sem cobrança gerada' },
  UNLINKED: { stroke: '#94a3b8', fill: '#e2e8f0', label: 'Não vinculado' }
};

export function ProjectMap({ mapData, projectId, onRefreshData }: ProjectMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const lotsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const quadrasLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const labelsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const measureLayerGroupRef = useRef<L.LayerGroup | null>(null);

  // Layout & Sidebar States (CTMGEO Geoportal Pattern)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [sidebarTab, setSidebarTab] = useState<'info' | 'layers' | 'filters'>('info');

  // GIS Tool Mode
  const [activeTool, setActiveTool] = useState<GISTool>('identify');
  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number } | null>(null);
  const [measurementResult, setMeasurementResult] = useState<string | null>(null);

  // States
  const [visualMode, setVisualMode] = useState<VisualMode>('contractual');
  const [showAerialImage, setShowAerialImage] = useState<boolean>(mapData.hasAerialImage);
  const [showQuadrasLayer, setShowQuadrasLayer] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedQuadraFilter, setSelectedQuadraFilter] = useState<string>('ALL');
  const [selectedFeature, setSelectedFeature] = useState<LotDrawerData | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(3);

  // States for Modals
  const [isBlockModalOpen, setIsBlockModalOpen] = useState<boolean>(false);
  const [isLotModalOpen, setIsLotModalOpen] = useState<boolean>(false);
  const [isEspelhoModalOpen, setIsEspelhoModalOpen] = useState<boolean>(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [lotModalInitialData, setLotModalInitialData] = useState<LotFormInitialData | null>(null);

  // Measurement points ref
  const measurePointsRef = useRef<L.LatLng[]>([]);
  const measureLineRef = useRef<L.Polyline | null>(null);
  const measurePolygonRef = useRef<L.Polygon | null>(null);
  const selectedLayerRef = useRef<L.Polygon | null>(null);

  // Stats calculation
  const stats = mapData.stats || {
    contractual: { signed: 0, notSigned: 0, distrato: 0, unlinked: 0, total: 0 },
    financial: { paid: 0, upToDate: 0, overdue: 0, noCharges: 0, unlinked: 0, total: 0 }
  };

  // Available quadras in map data
  const availableQuadras = useMemo(() => {
    if (!mapData?.geojson?.features) return [];
    const quadras: { id: string; label: string; number: string; totalLots?: number }[] = [];
    mapData.geojson.features.forEach((f: any) => {
      if (f.properties?.type === 'quadra') {
        quadras.push({
          id: f.id || f.properties.featureId,
          label: f.properties.label || `Quadra ${f.properties.blockNumber || ''}`,
          number: f.properties.blockNumber || '',
          totalLots: f.properties.totalLots
        });
      }
    });
    return quadras.sort((a, b) =>
      (a.number || '').localeCompare(b.number || '', undefined, { numeric: true })
    );
  }, [mapData]);

  // Custom UTM Planar CRS based on tile metadata
  const customCRS = useMemo(() => {
    const originX = mapData.metadata?.utmOrigin?.[0] || 231402.5559573;
    const maxY = mapData.metadata?.utmMaxY || 8871330.8190441;
    const baseRes = mapData.metadata?.baseResolution || 12.8;

    return L.Util.extend({}, L.CRS.Simple, {
      transformation: new L.Transformation(
        1 / baseRes,
        -originX / baseRes,
        -1 / baseRes,
        maxY / baseRes
      )
    });
  }, [mapData]);

  // Project bounds in UTM
  const projectBounds = useMemo(() => {
    const b = mapData.metadata?.bounds || {
      minX: 231402.5559573,
      minY: 8869656.2052522,
      maxX: 233131.0919187,
      maxY: 8871330.8190441
    };
    return L.latLngBounds(
      L.latLng(b.minY, b.minX),
      L.latLng(b.maxY, b.maxX)
    );
  }, [mapData]);

  // Calculate Euclidean Planar Distance in meters (UTM coordinates)
  const calcEuclideanDistance = (pts: L.LatLng[]) => {
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      total += Math.hypot(pts[i + 1].lng - pts[i].lng, pts[i + 1].lat - pts[i].lat);
    }
    return total;
  };

  // Calculate Planar Area in m² via Shoelace formula
  const calcShoelaceArea = (pts: L.LatLng[]) => {
    let area = 0;
    const n = pts.length;
    if (n < 3) return 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += pts[i].lng * pts[j].lat;
      area -= pts[j].lng * pts[i].lat;
    }
    return Math.abs(area) / 2.0;
  };

  // Clear Active Measurement
  const handleClearMeasurement = useCallback(() => {
    if (measureLayerGroupRef.current) {
      measureLayerGroupRef.current.clearLayers();
    }
    measurePointsRef.current = [];
    measureLineRef.current = null;
    measurePolygonRef.current = null;
    setMeasurementResult(null);
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      crs: customCRS,
      minZoom: 2,
      maxZoom: 10,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
      wheelDebounceTime: 60,
      wheelPxPerZoomLevel: 120
    });

    // Zoom control at bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Initial view
    map.fitBounds(projectBounds, { padding: [20, 20] });
    setCurrentZoom(map.getZoom());

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    // Mousemove for live coordinates
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({ x: e.latlng.lng, y: e.latlng.lat });
    });

    map.on('mouseout', () => {
      setCursorCoords(null);
    });

    // Invalidate size on resize
    const sizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);

    // Layer groups
    const lotsGroup = L.layerGroup().addTo(map);
    const quadrasGroup = L.layerGroup().addTo(map);
    const labelsGroup = L.layerGroup().addTo(map);
    const measureGroup = L.layerGroup().addTo(map);

    lotsLayerGroupRef.current = lotsGroup;
    quadrasLayerGroupRef.current = quadrasGroup;
    labelsLayerGroupRef.current = labelsGroup;
    measureLayerGroupRef.current = measureGroup;

    // Aerial Tile Layer (TMS) with proper Y inversion for EPSG:31981 / Simple CRS
    if (mapData.hasAerialImage && mapData.tileUrlTemplate) {
      const TMSTileLayer = L.TileLayer.extend({
        getTileUrl: function (coords: any) {
          const z = this._getZoomForUrl ? this._getZoomForUrl() : coords.z;
          const x = coords.x;
          const y = (1 << z) - 1 - coords.y;
          return `/api/map/tiles/${mapData.projectSlug}/${z}/${x}/${y}.jpg?v=2`;
        }
      });

      const tileLayer = new (TMSTileLayer as any)('', {
        minZoom: 2,
        maxNativeZoom: 7,
        maxZoom: 10,
        tileSize: 256,
        bounds: projectBounds,
        keepBuffer: 2,
        updateWhenIdle: true,
        updateWhenZooming: false
      });
      tileLayer.addTo(map);
      tileLayerRef.current = tileLayer;
    }

    mapInstanceRef.current = map;

    return () => {
      clearTimeout(sizeTimer);
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [customCRS, projectBounds, mapData]);

  // Adjust Leaflet size when sidebar toggles
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [isSidebarOpen]);

  // Setup Measurement Click Handlers based on activeTool
  useEffect(() => {
    const map = mapInstanceRef.current;
    const measureGroup = measureLayerGroupRef.current;
    if (!map || !measureGroup) return;

    if (activeTool !== 'measure_dist' && activeTool !== 'measure_area') {
      map.getContainer().style.cursor = '';
      return;
    }

    map.getContainer().style.cursor = 'crosshair';

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      const newPt = e.latlng;
      measurePointsRef.current.push(newPt);
      const pts = measurePointsRef.current;

      // Small vertex marker
      const marker = L.circleMarker(newPt, {
        radius: 4,
        color: '#0284c7',
        fillColor: '#ffffff',
        fillOpacity: 1,
        weight: 2
      });
      measureGroup.addLayer(marker);

      if (activeTool === 'measure_dist') {
        if (!measureLineRef.current) {
          const line = L.polyline(pts, {
            color: '#0284c7',
            weight: 3,
            dashArray: '6, 6'
          }).addTo(measureGroup);
          measureLineRef.current = line;
        } else {
          measureLineRef.current.setLatLngs(pts);
        }

        const dist = calcEuclideanDistance(pts);
        const text = dist >= 1000 ? `${(dist / 1000).toFixed(3)} km` : `${dist.toFixed(2)} m`;
        setMeasurementResult(`Distância: ${text} (${pts.length} pontos)`);

        marker.bindTooltip(text, { permanent: true, direction: 'top', className: 'measure-tooltip' });
      } else if (activeTool === 'measure_area') {
        if (pts.length >= 3) {
          if (!measurePolygonRef.current) {
            const poly = L.polygon(pts, {
              color: '#0284c7',
              weight: 2,
              fillColor: '#38bdf8',
              fillOpacity: 0.35,
              dashArray: '4, 4'
            }).addTo(measureGroup);
            measurePolygonRef.current = poly;
          } else {
            measurePolygonRef.current.setLatLngs(pts);
          }

          const area = calcShoelaceArea(pts);
          const perim = calcEuclideanDistance([...pts, pts[0]]);
          const text = area >= 10000 ? `${(area / 10000).toFixed(2)} ha (${area.toFixed(0)} m²)` : `${area.toFixed(2)} m²`;
          setMeasurementResult(`Área: ${text} | Perímetro: ${perim.toFixed(2)} m`);
        } else {
          setMeasurementResult(`Clique mais ${3 - pts.length} ponto(s) para formar um polígono`);
        }
      }
    };

    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
      if (map.getContainer()) {
        map.getContainer().style.cursor = '';
      }
    };
  }, [activeTool]);

  // Toggle Aerial Tile Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    const tileLayer = tileLayerRef.current;
    if (!map || !tileLayer) return;

    if (showAerialImage) {
      if (!map.hasLayer(tileLayer)) {
        tileLayer.addTo(map);
        tileLayer.bringToBack();
      }
    } else {
      if (map.hasLayer(tileLayer)) {
        map.removeLayer(tileLayer);
      }
    }
  }, [showAerialImage]);

  // Toggle Quadras Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    const quadrasGroup = quadrasLayerGroupRef.current;
    if (!map || !quadrasGroup) return;

    if (showQuadrasLayer) {
      if (!map.hasLayer(quadrasGroup)) map.addLayer(quadrasGroup);
    } else {
      if (map.hasLayer(quadrasGroup)) map.removeLayer(quadrasGroup);
    }
  }, [showQuadrasLayer]);

  // Toggle Labels Layer
  useEffect(() => {
    const map = mapInstanceRef.current;
    const labelsGroup = labelsLayerGroupRef.current;
    if (!map || !labelsGroup) return;

    if (showLabels) {
      if (!map.hasLayer(labelsGroup)) map.addLayer(labelsGroup);
    } else {
      if (map.hasLayer(labelsGroup)) map.removeLayer(labelsGroup);
    }
  }, [showLabels]);

  // Render Features (Lots & Quadras) whenever mode, filters, or GeoJSON change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const lotsGroup = lotsLayerGroupRef.current;
    const quadrasGroup = quadrasLayerGroupRef.current;
    const labelsGroup = labelsLayerGroupRef.current;

    if (!map || !lotsGroup || !quadrasGroup || !labelsGroup || !mapData?.geojson?.features) {
      return;
    }

    lotsGroup.clearLayers();
    quadrasGroup.clearLayers();
    labelsGroup.clearLayers();

    const query = searchQuery.trim().toLowerCase();

    mapData.geojson.features.forEach((feature: any) => {
      const props = feature.properties || {};
      const fid = feature.id || props.featureId;
      const type = props.type || 'other';

      // Quadras layer
      if (type === 'quadra') {
        const ring = feature.geometry.coordinates[0];
        const latlngs = ring.map((p: number[]) => L.latLng(p[1], p[0]));

        const quadraPolygon = L.polygon(latlngs, {
          color: '#0284c7',
          weight: 2.5,
          dashArray: '8, 6',
          fillColor: '#38bdf8',
          fillOpacity: 0.06,
          interactive: true
        });

        quadraPolygon.bindTooltip(
          `<div class="p-1 text-xs">
             <p class="font-extrabold text-sm text-[#0f5964]">${props.label}</p>
             ${props.description ? `<p class="text-[11px] text-slate-600 font-medium">${props.description}</p>` : ''}
             ${props.totalLots ? `<p class="text-[10px] text-slate-500 mt-0.5">${props.totalLots} lotes nesta quadra</p>` : ''}
           </div>`,
          { sticky: true, direction: 'center', opacity: 0.95 }
        );

        quadraPolygon.on('mouseover', () => {
          quadraPolygon.setStyle({ weight: 3.5, fillOpacity: 0.16 });
        });
        quadraPolygon.on('mouseout', () => {
          quadraPolygon.setStyle({ weight: 2.5, fillOpacity: 0.06 });
        });

        quadrasGroup.addLayer(quadraPolygon);

        // Center badge always visible when Quadras layer is active
        if (props.utmCenter) {
          const center = L.latLng(props.utmCenter[1], props.utmCenter[0]);
          const quadraIcon = L.divIcon({
            className: 'quadra-label-icon',
            html: `
              <div class="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/90 text-white font-extrabold text-xs border border-sky-400 shadow-xl backdrop-blur-md whitespace-nowrap tracking-wide select-none pointer-events-none">
                <span class="w-2 h-2 rounded-full bg-sky-400"></span>
                <span>${props.label}</span>
                ${props.totalLots ? `<span class="text-[10px] font-medium text-sky-200">(${props.totalLots}L)</span>` : ''}
              </div>
            `,
            iconSize: [110, 26],
            iconAnchor: [55, 13]
          });
          quadrasGroup.addLayer(L.marker(center, { icon: quadraIcon, interactive: false }));
        }
        return;
      }

      // Lots Layer
      if (type === 'lot' || (props.areaM2 >= 30 && props.areaM2 <= 2000)) {
        const ring = feature.geometry.coordinates[0];
        const latlngs = ring.map((p: number[]) => L.latLng(p[1], p[0]));

        const statusContract = props.statusContract || 'UNLINKED';
        const statusFinancial = props.statusFinancial || 'UNLINKED';

        // Check quadra filter
        if (selectedQuadraFilter !== 'ALL' && props.blockNumber !== selectedQuadraFilter) {
          const dimmedPoly = L.polygon(latlngs, {
            color: '#cbd5e1',
            weight: 0.5,
            fillColor: '#f1f5f9',
            fillOpacity: 0.05,
            interactive: false
          });
          lotsGroup.addLayer(dimmedPoly);
          return;
        }

        // Check search query match
        const matchesSearch =
          !query ||
          props.label?.toLowerCase().includes(query) ||
          fid?.toLowerCase().includes(query) ||
          props.lotNumber?.toLowerCase().includes(query) ||
          props.blockNumber?.toLowerCase().includes(query) ||
          props.lotData?.occupant?.name?.toLowerCase().includes(query) ||
          props.lotData?.occupant?.cpf?.includes(query);

        // Check status filter match
        let matchesStatus = true;
        if (statusFilter !== 'ALL') {
          if (visualMode === 'contractual') {
            matchesStatus = statusContract === statusFilter;
          } else {
            matchesStatus = statusFinancial === statusFilter;
          }
        }

        const isVisible = matchesSearch && matchesStatus;
        if (!isVisible && (searchQuery || statusFilter !== 'ALL')) {
          // Render dimmed polygon
          const dimmedPoly = L.polygon(latlngs, {
            color: '#94a3b8',
            weight: 0.5,
            fillColor: '#cbd5e1',
            fillOpacity: 0.08,
            interactive: true
          });
          lotsGroup.addLayer(dimmedPoly);
          return;
        }

        // Determine colors based on visual mode
        let strokeColor = '#0f766e';
        let fillColor = '#0d9488';
        let fillOpacity = 0.55;
        let dashArray: string | undefined = undefined;

        if (visualMode === 'contractual') {
          const cfg = CONTRACT_COLORS[statusContract as keyof typeof CONTRACT_COLORS] || CONTRACT_COLORS.UNLINKED;
          strokeColor = cfg.stroke;
          fillColor = cfg.fill;
          fillOpacity = statusContract === 'UNLINKED' ? 0.3 : 0.6;
          if (statusContract === 'UNLINKED') dashArray = '4, 4';
        } else {
          const cfg = FINANCIAL_COLORS[statusFinancial as keyof typeof FINANCIAL_COLORS] || FINANCIAL_COLORS.UNLINKED;
          strokeColor = cfg.stroke;
          fillColor = cfg.fill;
          fillOpacity = statusFinancial === 'UNLINKED' ? 0.3 : 0.65;
          if (statusFinancial === 'UNLINKED') dashArray = '4, 4';
        }

        const isSelected = selectedFeature?.featureId === fid;
        if (isSelected) {
          strokeColor = '#0284c7';
          fillColor = '#38bdf8';
          fillOpacity = 0.85;
        }

        const lotPoly = L.polygon(latlngs, {
          color: isSelected ? '#0284c7' : strokeColor,
          weight: isSelected ? 3.5 : 1.5,
          dashArray,
          fillColor: isSelected ? '#38bdf8' : fillColor,
          fillOpacity,
          interactive: true
        });

        // Hover Tooltip
        const tooltipContent = `
          <div class="text-xs p-1">
            <p class="font-bold text-slate-800">${props.label || `Lote ${fid}`}</p>
            <p class="text-[11px] text-slate-600">${props.areaM2 ? `${props.areaM2.toFixed(1)} m²` : ''}</p>
            ${props.lotData?.occupant ? `<p class="text-[11px] font-medium text-[#0f5964]">${props.lotData.occupant.name}</p>` : ''}
            <p class="text-[10px] text-slate-500 mt-0.5">
              ${visualMode === 'contractual'
                ? CONTRACT_COLORS[statusContract as keyof typeof CONTRACT_COLORS]?.label
                : FINANCIAL_COLORS[statusFinancial as keyof typeof FINANCIAL_COLORS]?.label}
            </p>
          </div>
        `;
        lotPoly.bindTooltip(tooltipContent, {
          sticky: true,
          direction: 'top',
          opacity: 0.95
        });

        // Click handler to select feature & show cadastral card in sidebar
        lotPoly.on('click', () => {
          if (activeTool === 'measure_dist' || activeTool === 'measure_area') {
            return; // let measure tool receive click
          }

          setSelectedFeature({
            featureId: fid,
            type: 'lot',
            label: props.label || `Lote ${fid}`,
            lotNumber: props.lotNumber,
            blockNumber: props.blockNumber,
            areaM2: props.areaM2,
            perimeterM: props.perimeterM,
            utmCenter: props.utmCenter,
            wgsCenter: props.wgsCenter,
            statusContract,
            statusFinancial,
            lotData: props.lotData || null
          });

          // Automatically switch sidebar to Informações and ensure sidebar is visible
          setSidebarTab('info');
          setIsSidebarOpen(true);

          // Highlight polygon
          if (selectedLayerRef.current) {
            selectedLayerRef.current.setStyle({
              weight: 1.5,
              color: strokeColor,
              fillOpacity
            });
          }
          lotPoly.setStyle({
            weight: 3.5,
            color: '#0284c7',
            fillColor: '#38bdf8',
            fillOpacity: 0.85
          });
          selectedLayerRef.current = lotPoly;
        });

        // Mouseover hover effect
        lotPoly.on('mouseover', () => {
          if (selectedFeature?.featureId !== fid) {
            lotPoly.setStyle({
              weight: 2.5,
              fillOpacity: Math.min(1, fillOpacity + 0.2)
            });
          }
        });

        lotPoly.on('mouseout', () => {
          if (selectedFeature?.featureId !== fid) {
            lotPoly.setStyle({
              weight: 1.5,
              fillOpacity
            });
          }
        });

        lotsGroup.addLayer(lotPoly);

        // Zoom-dependent lot label marker (show when zoom >= 6)
        if (props.utmCenter && currentZoom >= 6) {
          const center = L.latLng(props.utmCenter[1], props.utmCenter[0]);
          const shortLabel = props.lotNumber ? `L${props.lotNumber}` : `${props.label || fid}`.replace('lote_geo_', '#');
          const labelIcon = L.divIcon({
            className: 'lot-center-label',
            html: `<div class="px-1 py-0.2 rounded text-[10px] font-bold ${isSelected ? 'bg-sky-600 text-white' : 'bg-white/90 text-slate-700 shadow-xs'} border border-slate-200 pointer-events-none">${shortLabel}</div>`,
            iconSize: [40, 16],
            iconAnchor: [20, 8]
          });
          labelsGroup.addLayer(L.marker(center, { icon: labelIcon, interactive: false }));
        }
      }
    });
  }, [
    visualMode,
    searchQuery,
    statusFilter,
    selectedQuadraFilter,
    selectedFeature?.featureId,
    currentZoom,
    activeTool,
    mapData
  ]);

  // Reset view to project bounds
  const handleResetBounds = () => {
    if (mapInstanceRef.current && projectBounds) {
      mapInstanceRef.current.fitBounds(projectBounds, {
        padding: [20, 20],
        animate: true,
        duration: 0.8
      });
    }
  };

  // WhatsApp sender shortcut
  const handleOpenWhatsApp = (phone: string, occupantName: string, lotNum?: string, blockNum?: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const text = encodeURIComponent(
      `Olá ${occupantName}, tudo bem? Aqui é da equipe de Regularização Fundiária (Gênesis REURB) referente ao seu imóvel no loteamento ${mapData?.project?.name || 'Vila Nova'}${blockNum ? `, Quadra ${blockNum}` : ''}${lotNum ? `, Lote ${lotNum}` : ''}.`
    );
    window.open(`https://wa.me/55${cleanPhone}?text=${text}`, '_blank');
  };

  // Lot and Block management handlers
  const handleCreateLotForFeature = (featureData: LotDrawerData) => {
    setEditingLotId(null);
    setLotModalInitialData({
      geographicFile: featureData.featureId,
      area: featureData.areaM2,
      perimeter: featureData.perimeterM,
      number: featureData.lotNumber || ''
    });
    setIsLotModalOpen(true);
  };

  const handleEditLot = (lotId: string) => {
    setLotModalInitialData(null);
    setEditingLotId(lotId);
    setIsLotModalOpen(true);
  };

  const occupant = selectedFeature?.lotData?.occupant;
  const contract = selectedFeature?.lotData?.contract;
  const financial = selectedFeature?.lotData?.financial;

  return (
    <div className="relative w-full h-[calc(100vh-190px)] min-h-[580px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm flex flex-col select-none">
      {/* ============================================================ */}
      {/* TOP GIS RIBBON / CONTROL BAR (CTMGEO STYLE)                   */}
      {/* ============================================================ */}
      <div className="shrink-0 z-20 px-3 py-2 bg-white/95 backdrop-blur-md border-b border-slate-200/90 flex flex-wrap items-center justify-between gap-2 shadow-xs">
        {/* Left: GIS Tool Modes */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 gap-1">
          {/* Navegar (Pan) */}
          <button
            type="button"
            onClick={() => {
              setActiveTool('nav');
              handleClearMeasurement();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTool === 'nav' ? 'bg-[#0f5964] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Navegar livremente pelo mapa (Pan)"
          >
            <Hand className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Navegar</span>
          </button>

          {/* Identificar (Info) */}
          <button
            type="button"
            onClick={() => {
              setActiveTool('identify');
              handleClearMeasurement();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTool === 'identify' ? 'bg-[#0f5964] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Identificar lote e abrir Cadastro Imobiliário"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Identificar</span>
          </button>

          {/* Medir Distância */}
          <button
            type="button"
            onClick={() => {
              handleClearMeasurement();
              setActiveTool('measure_dist');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTool === 'measure_dist' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Medir distância em metros (clique nos pontos)"
          >
            <Ruler className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Medir Distância</span>
          </button>

          {/* Medir Área */}
          <button
            type="button"
            onClick={() => {
              handleClearMeasurement();
              setActiveTool('measure_area');
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTool === 'measure_area' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Medir área em m² e perímetro (desenhe um polígono)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Medir Área</span>
          </button>

          {/* Limpar Medição */}
          {measurementResult && (
            <button
              type="button"
              onClick={handleClearMeasurement}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition cursor-pointer"
              title="Limpar medição desenhada"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Limpar</span>
            </button>
          )}
        </div>

        {/* Center: Search & Reset */}
        <div className="flex items-center gap-1.5 flex-1 max-w-xs sm:max-w-sm">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar lote, quadra ou titular..."
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleResetBounds}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium shadow-2xs transition cursor-pointer shrink-0"
            title="Enquadrar projeto inteiro"
          >
            <Crosshair className="w-3.5 h-3.5 text-[#0f5964]" />
            <span className="hidden sm:inline">Enquadrar</span>
          </button>
        </div>

        {/* Right: Quadras, Novo Lote & Coordinates Readout */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsBlockModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-teal-200 bg-teal-50/80 hover:bg-teal-100 text-[#0f5964] text-xs font-bold shadow-2xs transition cursor-pointer"
            title="Gerenciar quadras oficiais"
          >
            <Building className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Quadras</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingLotId(null);
              setLotModalInitialData(null);
              setIsLotModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0f5964] hover:bg-[#0c4750] text-white text-xs font-bold shadow-2xs transition cursor-pointer"
            title="Cadastrar novo lote"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Novo Lote</span>
          </button>

          {/* Coordinate Readout */}
          <div className="hidden xl:flex items-center gap-2 pl-2 border-l border-slate-200 text-[11px] font-mono text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            <Compass className="w-3.5 h-3.5 text-[#0f5964]" />
            <span>
              {cursorCoords
                ? `X: ${Math.round(cursorCoords.x).toLocaleString('pt-BR')} m | Y: ${Math.round(cursorCoords.y).toLocaleString('pt-BR')} m`
                : 'UTM SIRGAS 2000'}
            </span>
          </div>
        </div>
      </div>

      {/* Measurement Active Notification Banner */}
      {measurementResult && (
        <div className="shrink-0 z-10 px-4 py-1.5 bg-sky-50 border-b border-sky-200 text-xs text-sky-800 font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-sky-600" />
            <span>{measurementResult}</span>
          </div>
          <button
            type="button"
            onClick={handleClearMeasurement}
            className="text-[11px] font-bold text-sky-700 hover:text-sky-900 underline cursor-pointer"
          >
            Finalizar / Limpar
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* WORKSPACE: SIDEBAR + MAP CONTAINER                           */}
      {/* ============================================================ */}
      <div className="relative flex-1 w-full min-h-0 flex overflow-hidden">
        {/* ========================================================== */}
        {/* LEFT DOCKED GEOPORTAL SIDEBAR (CTMGEO CADASTRO IMOBILIÁRIO)*/}
        {/* ========================================================== */}
        <div
          className={`relative z-10 bg-white border-r border-slate-200/90 shadow-lg flex flex-col transition-all duration-300 ease-in-out shrink-0 ${
            isSidebarOpen ? 'w-80 sm:w-96' : 'w-0 border-r-0'
          }`}
        >
          {isSidebarOpen && (
            <>
              {/* Sidebar Tabs Header */}
              <div className="shrink-0 flex items-center bg-slate-50 border-b border-slate-200 p-1">
                <button
                  type="button"
                  onClick={() => setSidebarTab('info')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                    sidebarTab === 'info'
                      ? 'bg-white text-[#0f5964] shadow-xs border border-slate-200/80'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Info className="w-3.5 h-3.5" />
                  Informações
                </button>

                <button
                  type="button"
                  onClick={() => setSidebarTab('layers')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                    sidebarTab === 'layers'
                      ? 'bg-white text-[#0f5964] shadow-xs border border-slate-200/80'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Camadas
                </button>

                <button
                  type="button"
                  onClick={() => setSidebarTab('filters')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                    sidebarTab === 'filters'
                      ? 'bg-white text-[#0f5964] shadow-xs border border-slate-200/80'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filtros
                </button>
              </div>

              {/* Sidebar Content Area */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
                {/* TAB 1: INFORMAÇÕES (CADASTRO IMOBILIÁRIO) */}
                {sidebarTab === 'info' && (
                  <>
                    {selectedFeature ? (
                      <div className="space-y-3.5 animate-in fade-in duration-150">
                        {/* Imóvel Identification Header Card */}
                        <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#0f5964] to-[#0c4750] text-white shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-200">
                              Cadastro Imobiliário
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-white/20 text-white backdrop-blur-xs">
                              {selectedFeature.statusContract === 'CONTRACT_SIGNED'
                                ? 'Regularizado'
                                : selectedFeature.statusContract === 'UNLINKED'
                                ? 'Não Vinculado'
                                : 'Em Regularização'}
                            </span>
                          </div>

                          <div className="mt-2 flex items-baseline justify-between">
                            <div>
                              <h3 className="text-base font-black">
                                {selectedFeature.blockNumber ? `Quadra ${selectedFeature.blockNumber}` : 'Quadra S/N'} •{' '}
                                {selectedFeature.lotNumber ? `Lote ${selectedFeature.lotNumber}` : selectedFeature.label}
                              </h3>
                              <p className="text-xs text-teal-100 mt-0.5">{mapData?.project?.name || 'Vila Nova'}</p>
                            </div>

                            <button
                              type="button"
                              onClick={() => setIsEspelhoModalOpen(true)}
                              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition cursor-pointer"
                              title="Imprimir Espelho Cadastral Oficial"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Localização */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                            <MapPin className="w-3.5 h-3.5 text-[#0f5964]" />
                            <span>Localização</span>
                          </div>
                          <div className="text-xs text-slate-600 space-y-0.5">
                            <p>
                              <span className="font-semibold text-slate-700">Endereço:</span>{' '}
                              {selectedFeature.lotData?.address || 'Rua Projetada'}
                            </p>
                            <p>
                              <span className="font-semibold text-slate-700">Loteamento:</span>{' '}
                              {mapData?.project?.name || 'Vila Nova'}
                            </p>
                            <p>
                              <span className="font-semibold text-slate-700">Município:</span> Aripuanã - MT
                            </p>
                          </div>
                        </div>

                        {/* Informações Territoriais */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                            <span className="flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-[#0f5964]" />
                              Informações Territoriais
                            </span>
                            <span className="text-[10px] font-normal text-slate-500">SIRGAS 2000</span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2 rounded-lg bg-white border border-slate-200">
                              <span className="text-[10px] text-slate-400 font-medium block">Área</span>
                              <span className="font-bold text-slate-800">
                                {selectedFeature.areaM2 ? `${selectedFeature.areaM2.toFixed(2)} m²` : '-'}
                              </span>
                            </div>

                            <div className="p-2 rounded-lg bg-white border border-slate-200">
                              <span className="text-[10px] text-slate-400 font-medium block">Perímetro</span>
                              <span className="font-bold text-slate-800">
                                {selectedFeature.perimeterM ? `${selectedFeature.perimeterM.toFixed(2)} m` : '-'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Titular / Ocupante */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                            <span className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-[#0f5964]" />
                              Titular / Ocupante
                            </span>
                          </div>

                          {occupant ? (
                            <div className="space-y-2 text-xs">
                              <div className="p-2 rounded-lg bg-white border border-slate-200 space-y-1">
                                <p className="font-bold text-slate-900">{occupant.name}</p>
                                <p className="text-slate-600 font-mono text-[11px]">
                                  CPF: {occupant.cpf || 'Não informado'}
                                </p>
                                {occupant.phone && (
                                  <p className="text-slate-600 text-[11px]">
                                    Telefone: {occupant.phone}
                                  </p>
                                )}
                              </div>

                              {occupant.phone && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleOpenWhatsApp(
                                      occupant.phone!,
                                      occupant.name,
                                      selectedFeature.lotNumber,
                                      selectedFeature.blockNumber
                                    )
                                  }
                                  className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition cursor-pointer"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  Enviar Mensagem WhatsApp
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-800">
                              Nenhum morador ou titular vinculado a este lote.
                            </div>
                          )}
                        </div>

                        {/* Situação Contratual & Financeira */}
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                            <span className="flex items-center gap-1.5">
                              <DollarSign className="w-3.5 h-3.5 text-[#0f5964]" />
                              Contrato & Financeiro
                            </span>
                          </div>

                          <div className="space-y-1.5 text-xs">
                            <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                              <span className="text-slate-500">Contrato</span>
                              <span className="font-bold text-slate-800">
                                {selectedFeature.statusContract === 'CONTRACT_SIGNED'
                                  ? 'Assinado'
                                  : selectedFeature.statusContract === 'NOT_SIGNED'
                                  ? 'Pendente'
                                  : 'Não emitido'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                              <span className="text-slate-500">Situação Financeira</span>
                              <span className="font-bold text-emerald-700">
                                {selectedFeature.statusFinancial === 'PAID'
                                  ? 'Quitado'
                                  : selectedFeature.statusFinancial === 'UP_TO_DATE'
                                  ? 'Em dia'
                                  : selectedFeature.statusFinancial === 'OVERDUE'
                                  ? 'Em atraso'
                                  : 'Sem cobrança'}
                              </span>
                            </div>

                            {financial && (
                              <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200">
                                <span className="text-slate-500">Parcelas Pagas</span>
                                <span className="font-bold text-slate-800">
                                  {financial.paidInstallments} de {financial.totalInstallments}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="space-y-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setIsEspelhoModalOpen(true)}
                            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#0f5964] hover:bg-[#0c4750] text-white font-bold text-xs shadow-xs transition cursor-pointer"
                          >
                            <Printer className="w-4 h-4" />
                            Imprimir Espelho Cadastral (A4)
                          </button>

                          <div className="grid grid-cols-2 gap-2">
                            {selectedFeature.lotData?.id && (
                              <button
                                type="button"
                                onClick={() => handleEditLot(selectedFeature.lotData!.id)}
                                className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                                Editar Dados
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setIsDrawerOpen(true)}
                              className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                              Prontuário
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Empty state when no lot is selected */
                      <div className="p-6 text-center space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-teal-50 text-[#0f5964] flex items-center justify-center mx-auto">
                          <Compass className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800">Cadastro Imobiliário</h4>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            Clique em qualquer lote no mapa para consultar a ficha cadastral do imóvel, dados do titular e situação financeira.
                          </p>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-left space-y-2 mt-4">
                          <span className="text-[11px] font-bold text-slate-700 block">Resumo do Loteamento</span>
                          <div className="text-xs text-slate-600 space-y-1">
                            <div className="flex justify-between">
                              <span>Total de Lotes:</span>
                              <span className="font-bold text-slate-800">{stats.contractual.total}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Contratos Assinados:</span>
                              <span className="font-bold text-teal-700">{stats.contractual.signed}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Lotes Quitados:</span>
                              <span className="font-bold text-emerald-700">{stats.financial.paid}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* TAB 2: CAMADAS */}
                {sidebarTab === 'layers' && (
                  <div className="space-y-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Gerenciador de Camadas
                    </span>

                    {/* Aerial Image Switch */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-2.5">
                        <ImageIcon className="w-4 h-4 text-slate-500" />
                        <div>
                          <p className="text-xs font-bold text-slate-800">Ortofoto de Drone</p>
                          <p className="text-[11px] text-slate-500">Imagem aérea georreferenciada</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAerialImage(!showAerialImage)}
                        disabled={!mapData.hasAerialImage}
                        className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                          showAerialImage ? 'bg-[#0f5964]' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                            showAerialImage ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Quadras Boundaries Switch */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-2.5">
                        <Building className="w-4 h-4 text-slate-500" />
                        <div>
                          <p className="text-xs font-bold text-slate-800">Limites das Quadras</p>
                          <p className="text-[11px] text-slate-500">Polígonos das 6 quadras oficiais</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowQuadrasLayer(!showQuadrasLayer)}
                        className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                          showQuadrasLayer ? 'bg-[#0f5964]' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                            showQuadrasLayer ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Lot Labels Switch */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-slate-500" />
                        <div>
                          <p className="text-xs font-bold text-slate-800">Rótulos dos Lotes</p>
                          <p className="text-[11px] text-slate-500">Numeração visível no zoom</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowLabels(!showLabels)}
                        className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                          showLabels ? 'bg-[#0f5964]' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-white shadow-xs transition-transform transform ${
                            showLabels ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 3: FILTROS E TEMAS */}
                {sidebarTab === 'filters' && (
                  <div className="space-y-4">
                    {/* Visual Mode Switcher */}
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                        Modo Temático
                      </span>
                      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200">
                        <button
                          type="button"
                          onClick={() => {
                            setVisualMode('contractual');
                            setStatusFilter('ALL');
                          }}
                          className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                            visualMode === 'contractual'
                              ? 'bg-[#0f5964] text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Contratual
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVisualMode('financial');
                            setStatusFilter('ALL');
                          }}
                          className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                            visualMode === 'financial'
                              ? 'bg-emerald-700 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          Financeiro
                        </button>
                      </div>
                    </div>

                    {/* Filter by Quadra */}
                    {availableQuadras.length > 0 && (
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                          Filtrar por Quadra
                        </span>
                        <select
                          value={selectedQuadraFilter}
                          onChange={(e) => setSelectedQuadraFilter(e.target.value)}
                          className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 transition cursor-pointer"
                        >
                          <option value="ALL">Todas as Quadras ({availableQuadras.length})</option>
                          {availableQuadras.map((q) => (
                            <option key={q.id} value={q.number}>
                              {q.label} {q.totalLots ? `(${q.totalLots} lotes)` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Status Pill Filters */}
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                        Situação ({visualMode === 'contractual' ? 'Contratual' : 'Financeira'})
                      </span>
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => setStatusFilter('ALL')}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                            statusFilter === 'ALL'
                              ? 'bg-slate-800 text-white'
                              : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span>Todos</span>
                          <span className="text-[11px] opacity-80">
                            {visualMode === 'contractual' ? stats.contractual.total : stats.financial.total}
                          </span>
                        </button>

                        {visualMode === 'contractual' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setStatusFilter(statusFilter === 'CONTRACT_SIGNED' ? 'ALL' : 'CONTRACT_SIGNED')}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                                statusFilter === 'CONTRACT_SIGNED'
                                  ? 'bg-teal-700 text-white'
                                  : 'bg-teal-50 border border-teal-200 text-teal-800 hover:bg-teal-100'
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-teal-500" />
                                Contrato Assinado
                              </span>
                              <span>{stats.contractual.signed}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setStatusFilter(statusFilter === 'NOT_SIGNED' ? 'ALL' : 'NOT_SIGNED')}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                                statusFilter === 'NOT_SIGNED'
                                  ? 'bg-slate-700 text-white'
                                  : 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-slate-500" />
                                Sem Contrato
                              </span>
                              <span>{stats.contractual.notSigned}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setStatusFilter(statusFilter === 'DISTRATTO' ? 'ALL' : 'DISTRATTO')}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                                statusFilter === 'DISTRATTO'
                                  ? 'bg-orange-600 text-white'
                                  : 'bg-orange-50 border border-orange-200 text-orange-800 hover:bg-orange-100'
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-orange-500" />
                                Distrato
                              </span>
                              <span>{stats.contractual.distrato}</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setStatusFilter(statusFilter === 'PAID' ? 'ALL' : 'PAID')}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                                statusFilter === 'PAID'
                                  ? 'bg-emerald-700 text-white'
                                  : 'bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                Quitado
                              </span>
                              <span>{stats.financial.paid}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setStatusFilter(statusFilter === 'UP_TO_DATE' ? 'ALL' : 'UP_TO_DATE')}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                                statusFilter === 'UP_TO_DATE'
                                  ? 'bg-blue-700 text-white'
                                  : 'bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100'
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-blue-500" />
                                Em Dia
                              </span>
                              <span>{stats.financial.upToDate}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setStatusFilter(statusFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE')}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                                statusFilter === 'OVERDUE'
                                  ? 'bg-red-700 text-white'
                                  : 'bg-red-50 border border-red-200 text-red-800 hover:bg-red-100'
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-red-500" />
                                Em Atraso
                              </span>
                              <span>{stats.financial.overdue}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Toggle Sidebar Handle Button */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute -right-3.5 top-1/2 -translate-y-1/2 z-30 w-7 h-10 rounded-r-lg bg-white border border-l-0 border-slate-300 shadow-md flex items-center justify-center text-slate-600 hover:text-slate-900 transition cursor-pointer"
            title={isSidebarOpen ? 'Recolher barra lateral' : 'Expandir barra lateral'}
          >
            {isSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* ========================================================== */}
        {/* MAIN LEAFLET MAP CANVAS                                    */}
        {/* ========================================================== */}
        <div
          ref={mapContainerRef}
          className="relative flex-1 h-full min-h-0 z-0 bg-[#f8fafc]"
        />

        {/* Aerial Imagery Status Watermark / Notice when off */}
        {!showAerialImage && (
          <div className="absolute bottom-3 left-3 z-10 pointer-events-none px-3 py-1.5 rounded-lg bg-white/90 border border-slate-200 shadow-xs text-xs text-slate-500 backdrop-blur-xs flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            Modo Fundo Neutro Ativo
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* LOT DETAILS DRAWER (DETALHES AVANÇADOS / HISTÓRICO)          */}
      {/* ============================================================ */}
      {isDrawerOpen && (
        <LotMapDrawer
          data={selectedFeature}
          projectId={projectId}
          availableLots={mapData.availableLotsForLinking || []}
          onClose={() => setIsDrawerOpen(false)}
          onLinkSuccess={() => {
            if (onRefreshData) onRefreshData();
            setIsDrawerOpen(false);
          }}
          onUnlinkSuccess={() => {
            if (onRefreshData) onRefreshData();
            setIsDrawerOpen(false);
          }}
          onCreateLotForFeature={handleCreateLotForFeature}
          onEditLot={handleEditLot}
        />
      )}

      {/* ============================================================ */}
      {/* ESPELHO CADASTRAL MODAL (A4 IMPRESSÃO / PDF)                 */}
      {/* ============================================================ */}
      <EspelhoCadastralModal
        isOpen={isEspelhoModalOpen}
        onClose={() => setIsEspelhoModalOpen(false)}
        lotData={selectedFeature}
        projectName={mapData.project?.name}
      />

      {/* ============================================================ */}
      {/* BLOCK MANAGER MODAL                                          */}
      {/* ============================================================ */}
      <BlockManagerModal
        isOpen={isBlockModalOpen}
        onClose={() => setIsBlockModalOpen(false)}
        projectId={projectId}
        projectName={mapData.project?.name}
        onSuccess={() => {
          if (onRefreshData) onRefreshData();
        }}
      />

      {/* ============================================================ */}
      {/* LOT FORM MODAL (CREATE & EDIT)                               */}
      {/* ============================================================ */}
      <LotFormModal
        isOpen={isLotModalOpen}
        onClose={() => {
          setIsLotModalOpen(false);
          setEditingLotId(null);
          setLotModalInitialData(null);
        }}
        projectId={projectId}
        projectName={mapData.project?.name}
        initialData={lotModalInitialData}
        editingLotId={editingLotId}
        onSuccess={() => {
          if (onRefreshData) onRefreshData();
        }}
      />
    </div>
  );
}
