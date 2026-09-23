import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Camera,
  X,
  Upload,
  RefreshCw,
  RotateCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  MapPin,
  Sparkles,
  Zap,
  ZapOff,
  SwitchCamera,
  Check,
  ChevronRight,
  Layers,
  HelpCircle,
  Eye,
  Sliders,
  Plus
} from 'lucide-react';
import { formatCpf } from '../utils/cpf';

interface Project {
  id: string;
  name: string;
}

interface Block {
  id: string;
  number: string;
  projectId: string;
}

interface Lot {
  id: string;
  number: string;
  blockId: string;
  occupancies?: Array<{
    current: boolean;
    type: string;
    person: {
      id: string;
      fullName: string;
      cpf?: string | null;
      rg?: string | null;
    };
  }>;
}

interface CapturedPage {
  id: string;
  label: string; // e.g. 'Frente', 'Verso', 'Página 1'
  dataUrl: string;
  rotation: number; // 0, 90, 180, 270
  filter: 'original' | 'scanner' | 'grayscale';
  processedBlob?: Blob;
}

interface DocumentScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProjectId?: string;
  initialBlockId?: string;
  initialLotId?: string;
  initialPersonId?: string;
  initialCategory?: string;
  onScanComplete?: (document: any) => void;
}

const DOCUMENT_CATEGORIES = [
  { id: 'RG_TITULAR', label: 'RG / Identidade (Frente e Verso)', mode: 'two_sided', category: 'RG/CPF ou CNH do Titular' },
  { id: 'CNH_TITULAR', label: 'CNH (Carteira de Habilitação)', mode: 'two_sided', category: 'RG/CPF ou CNH do Titular' },
  { id: 'DOC_SPOUSE', label: 'Documento do Cônjuge (RG/CNH)', mode: 'two_sided', category: 'Documento do Cônjuge' },
  { id: 'RESIDENCE', label: 'Comprovante de Residência', mode: 'single_page', category: 'Comprovante de Residência' },
  { id: 'CIVIL_CERT', label: 'Certidão de Casamento ou Nascimento', mode: 'multi_page', category: 'Certidão de Casamento ou Nascimento' },
  { id: 'PURCHASE_CONTRACT', label: 'Contrato de Compra e Venda', mode: 'multi_page', category: 'Contrato de Compra e Venda do Lote' },
  { id: 'CHAIN_CONTRACT', label: 'Cadeia Dominial (Contratos Anteriores)', mode: 'multi_page', category: 'Sequência de Contrato (Cadeia Dominial)' },
  { id: 'SERVICE_CONTRACT', label: 'Contrato / Termo de Adesão REURB', mode: 'multi_page', category: 'Contrato / Termo de Adesão REURB' },
  { id: 'COMPLEMENTARY', label: 'Documentos Complementares (IPTU/Planta)', mode: 'multi_page', category: 'Documentos Complementares' },
  { id: 'OUTROS', label: 'Outros Documentos', mode: 'single_page', category: 'Geral' },
];

export function DocumentScannerModal({
  isOpen,
  onClose,
  initialProjectId,
  initialBlockId,
  initialLotId,
  initialPersonId,
  initialCategory,
  onScanComplete,
}: DocumentScannerModalProps) {
  // Destination selection states
  const [projects, setProjects] = useState<Project[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || '');
  const [selectedBlockId, setSelectedBlockId] = useState<string>(initialBlockId || '');
  const [selectedLotId, setSelectedLotId] = useState<string>(initialLotId || '');
  const [selectedPerson, setSelectedPerson] = useState<{ id: string; fullName: string; cpf?: string | null; rg?: string | null } | null>(null);

  // Category & mode
  const [selectedCategoryConfig, setSelectedCategoryConfig] = useState(
    DOCUMENT_CATEGORIES.find((c) => c.category === initialCategory) || DOCUMENT_CATEGORIES[0]
  );

  // Captured pages
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [activePageSlot, setActivePageSlot] = useState<'front' | 'back' | number>('front');

  // Camera stream states
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);

  // Intelligent analysis & OCR
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [matchedEntity, setMatchedEntity] = useState<any>(null);
  const [updatePersonData, setUpdatePersonData] = useState<boolean>(true);

  // Uploading state
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load Projects on open
  useEffect(() => {
    if (!isOpen) return;
    axios.get('/api/projects').then((res) => {
      setProjects(res.data.data || []);
    }).catch(console.error);
  }, [isOpen]);

  // Load Blocks when Project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setBlocks([]);
      setSelectedBlockId('');
      return;
    }
    axios.get(`/api/blocks?projectId=${selectedProjectId}`).then((res) => {
      setBlocks(res.data.data || []);
    }).catch(console.error);
  }, [selectedProjectId]);

  // Load Lots when Block changes
  useEffect(() => {
    if (!selectedBlockId) {
      setLots([]);
      setSelectedLotId('');
      return;
    }
    axios.get(`/api/lots?blockId=${selectedBlockId}`).then((res) => {
      const lotList: Lot[] = res.data.data || [];
      setLots(lotList);

      // If initialLotId matches, auto-select
      if (initialLotId && lotList.some((l) => l.id === initialLotId)) {
        setSelectedLotId(initialLotId);
      }
    }).catch(console.error);
  }, [selectedBlockId, initialLotId]);

  // Auto-detect occupant when lot is selected
  useEffect(() => {
    if (!selectedLotId) {
      if (!initialPersonId) setSelectedPerson(null);
      return;
    }
    const lot = lots.find((l) => l.id === selectedLotId);
    if (lot && lot.occupancies && lot.occupancies.length > 0) {
      const owner = lot.occupancies.find((o) => o.current && o.type === 'OWNER')?.person || lot.occupancies[0].person;
      if (owner) {
        setSelectedPerson(owner);
      }
    }
  }, [selectedLotId, lots, initialPersonId]);

  // Camera Management
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setTorchOn(false);
    setHasTorch(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setCameraError(
          'Acesso à câmera não suportado ou bloqueado neste navegador. Se estiver no celular, certifique-se de acessar via HTTPS ou utilize a opção "Galeria".'
        );
        setCameraActive(false);
        return;
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.muted = true;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('[Scanner] Video play error:', playErr);
        }
      }

      setCameraActive(true);

      // Check for flash/torch support safely
      try {
        const videoTrack = stream.getVideoTracks()[0];
        const capabilities = (videoTrack && typeof videoTrack.getCapabilities === 'function' ? videoTrack.getCapabilities() : {}) as any;
        if (capabilities && capabilities.torch) {
          setHasTorch(true);
        }
      } catch (e) {
        // Torch not supported on iOS Safari
      }
    } catch (err: any) {
      console.warn('[Scanner] Camera error:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Permissão de acesso à câmera negada. Habilite a câmera nas configurações do navegador ou use o botão "Galeria".'
          : 'Não foi possível iniciar a câmera neste dispositivo. Utilize o botão de upload de arquivo.'
      );
      setCameraActive(false);
    }
  }, [facingMode, stopCamera]);

  // Switch between front and back camera
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Toggle flashlight / torch
  const toggleTorch = async () => {
    if (!streamRef.current || !hasTorch) return;
    const track = streamRef.current.getVideoTracks()[0];
    const newTorchState = !torchOn;
    try {
      await (track.applyConstraints as any)({ advanced: [{ torch: newTorchState }] });
      setTorchOn(newTorchState);
    } catch (e) {
      console.warn('[Scanner] Torch constraint failed:', e);
    }
  };

  // Start camera when modal opens
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setPages([]);
      setExtractedData(null);
      setMatchedEntity(null);
      setUploadSuccess(false);
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  // Apply visual filter (Original, Scanner P&B, Grayscale) to a canvas image
  const applyFilterToCanvas = (canvas: HTMLCanvasElement, filterType: 'original' | 'scanner' | 'grayscale') => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (filterType === 'original') return;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Luminance
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;

      if (filterType === 'grayscale') {
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      } else if (filterType === 'scanner') {
        // High contrast document binarization with dynamic threshold
        const threshold = 135;
        const contrastVal = gray > threshold ? 255 : Math.max(0, gray * 0.7);
        data[i] = contrastVal;
        data[i + 1] = contrastVal;
        data[i + 2] = contrastVal;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  };

  // Convert canvas to Data URL with rotation and filter
  const renderProcessedImage = (
    sourceImgOrCanvas: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    rotation = 0,
    filter: 'original' | 'scanner' | 'grayscale' = 'original'
  ): string => {
    const canvas = document.createElement('canvas');
    const isRotated = rotation === 90 || rotation === 270;

    const width = (sourceImgOrCanvas as any).videoWidth || (sourceImgOrCanvas as any).naturalWidth || sourceImgOrCanvas.width;
    const height = (sourceImgOrCanvas as any).videoHeight || (sourceImgOrCanvas as any).naturalHeight || sourceImgOrCanvas.height;

    canvas.width = isRotated ? height : width;
    canvas.height = isRotated ? width : height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(sourceImgOrCanvas as any, -width / 2, -height / 2, width, height);

    if (filter !== 'original') {
      applyFilterToCanvas(canvas, filter);
    }

    return canvas.toDataURL('image/jpeg', 0.92);
  };

  // Trigger snapshot from video element
  const captureSnapshot = () => {
    if (!videoRef.current || !cameraActive) return;

    const snapshotUrl = renderProcessedImage(videoRef.current, 0, 'original');

    let pageLabel = 'Página 1';
    if (selectedCategoryConfig.mode === 'two_sided') {
      pageLabel = activePageSlot === 'front' || pages.length === 0 ? 'Frente' : 'Verso';
    } else if (selectedCategoryConfig.mode === 'multi_page') {
      pageLabel = `Página ${pages.length + 1}`;
    }

    const newPage: CapturedPage = {
      id: String(Date.now()),
      label: pageLabel,
      dataUrl: snapshotUrl,
      rotation: 0,
      filter: 'original',
    };

    if (selectedCategoryConfig.mode === 'two_sided') {
      if (activePageSlot === 'front' || pages.length === 0) {
        setPages([newPage, ...pages.filter((p) => p.label !== 'Frente')]);
        setActivePageSlot('back');
      } else {
        setPages([...pages.filter((p) => p.label !== 'Verso'), newPage]);
      }
    } else {
      setPages((prev) => [...prev, newPage]);
    }

    // Trigger smart analysis automatically after first capture
    runOcrAnalysis(snapshotUrl);
  };

  // Handle file gallery upload
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        let label = `Página ${pages.length + index + 1}`;
        if (selectedCategoryConfig.mode === 'two_sided') {
          label = index === 0 && pages.length === 0 ? 'Frente' : 'Verso';
        }

        const newPage: CapturedPage = {
          id: String(Date.now() + index),
          label,
          dataUrl,
          rotation: 0,
          filter: 'original',
        };

        setPages((prev) => [...prev, newPage]);
        if (index === 0) runOcrAnalysis(dataUrl);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Rotate a page by 90 degrees
  const rotatePage = (pageId: string) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== pageId) return p;
        const newRotation = (p.rotation + 90) % 360;
        return { ...p, rotation: newRotation };
      })
    );
  };

  // Change image filter
  const changePageFilter = (pageId: string, filter: 'original' | 'scanner' | 'grayscale') => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== pageId) return p;
        return { ...p, filter };
      })
    );
  };

  // Remove a page
  const removePage = (pageId: string) => {
    setPages((prev) => prev.filter((p) => p.id !== pageId));
  };

  // Run OCR and Intelligent Entity Extraction on image
  const runOcrAnalysis = async (dataUrl: string) => {
    setIsAnalyzing(true);
    try {
      // 1. Client-side OCR extraction with Tesseract.js
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('por');
      const ret = await worker.recognize(dataUrl);
      await worker.terminate();

      const extractedText = ret.data.text || '';

      // 2. Call backend analyze endpoint
      const res = await axios.post('/api/documents/scan/analyze', { text: extractedText });
      const data = res.data.data;

      if (data) {
        setExtractedData(data.extracted);
        setMatchedEntity(data.match);

        // Auto-match if high confidence and not already set
        if (data.match?.person && (!selectedPerson || !selectedLotId)) {
          if (data.match.lot) {
            setSelectedProjectId(data.match.lot.projectId);
            setSelectedBlockId(data.match.lot.blockId);
            setSelectedLotId(data.match.lot.id);
          }
          setSelectedPerson(data.match.person);
        }

        // Auto-select detected category
        if (data.extracted?.documentType) {
          const matchCat = DOCUMENT_CATEGORIES.find((c) => c.category === data.extracted.documentType);
          if (matchCat) setSelectedCategoryConfig(matchCat);
        }
      }
    } catch (ocrErr) {
      console.warn('[Scanner] OCR analysis skipped or failed:', ocrErr);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Convert Base64 dataURL to Blob for multipart upload
  const dataUrlToBlob = (dataUrl: string): Blob => {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  // Save Document and Bundle to backend
  const handleSaveDocument = async () => {
    if (pages.length === 0) return;
    setIsUploading(true);

    try {
      const formData = new FormData();

      // Process each page with its rotation & filter before uploading
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        // Create an image element to apply rotation/filter
        const img = new Image();
        img.src = page.dataUrl;
        await new Promise((resolve) => { img.onload = resolve; });

        const processedUrl = renderProcessedImage(img, page.rotation, page.filter);
        const blob = dataUrlToBlob(processedUrl);
        formData.append('files', blob, `${page.label.toLowerCase()}_${Date.now()}_${i}.jpg`);
      }

      if (selectedLotId) formData.append('lotId', selectedLotId);
      if (selectedPerson?.id) formData.append('personId', selectedPerson.id);
      formData.append('category', selectedCategoryConfig.category);
      formData.append('updatePersonData', String(updatePersonData));

      if (extractedData) {
        formData.append('extractedData', JSON.stringify(extractedData));
      }

      // Compile to PDF for multi-page / two-sided docs
      formData.append('compileToPdf', String(pages.length > 1));

      const res = await axios.post('/api/documents/scan/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setUploadSuccess(true);
      if (onScanComplete) onScanComplete(res.data.data);

      setTimeout(() => {
        setUploadSuccess(false);
        setPages([]);
        setExtractedData(null);
        setMatchedEntity(null);
      }, 2500);
    } catch (uploadErr: any) {
      alert(uploadErr?.response?.data?.message || 'Erro ao salvar documento escaneado.');
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[96vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 bg-[#0f5964] text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-white/10 backdrop-blur-xs">
              <Camera className="w-5 h-5 text-teal-200" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                Scanner Inteligente de Documentos
                <span className="text-[10px] bg-teal-400/20 text-teal-100 border border-teal-300/30 px-2 py-0.5 rounded-full font-semibold">
                  Móvel & Campo
                </span>
              </h2>
              <p className="text-xs text-teal-100/80">
                Captura guiada de RG frente/verso, CNH e documentos com vinculação automática
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-teal-100 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Fechar scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 text-slate-800">
          {/* Step 1: Destination Selection & Smart Match */}
          <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0f5964] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-teal-600" />
                1. Destino do Documento (Quadra, Lote & Titular)
              </span>

              {matchedEntity?.confidence === 'HIGH' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  Identificado por OCR!
                </span>
              )}
            </div>

            {/* Selectors Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Project selector */}
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Projeto</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-[#0f5964]/20 focus:outline-none"
                >
                  <option value="">Selecione o Projeto</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Block selector */}
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Quadra</label>
                <select
                  value={selectedBlockId}
                  onChange={(e) => setSelectedBlockId(e.target.value)}
                  disabled={!selectedProjectId}
                  className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-[#0f5964]/20 focus:outline-none disabled:opacity-50"
                >
                  <option value="">Selecione a Quadra</option>
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>Quadra {b.number}</option>
                  ))}
                </select>
              </div>

              {/* Lot selector */}
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Lote</label>
                <select
                  value={selectedLotId}
                  onChange={(e) => setSelectedLotId(e.target.value)}
                  disabled={!selectedBlockId}
                  className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-[#0f5964]/20 focus:outline-none disabled:opacity-50"
                >
                  <option value="">Selecione o Lote</option>
                  {lots.map((l) => (
                    <option key={l.id} value={l.id}>Lote {l.number}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Occupant Card */}
            {selectedPerson && (
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-teal-50/70 border border-teal-200/80 text-xs">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-teal-700 shrink-0" />
                  <div>
                    <span className="font-semibold text-teal-950">{selectedPerson.fullName}</span>
                    <span className="text-teal-700 ml-2">CPF: {selectedPerson.cpf ? formatCpf(selectedPerson.cpf) : 'Não informado'}</span>
                  </div>
                </div>
                <span className="text-[11px] font-medium text-teal-800 bg-teal-100 px-2 py-0.5 rounded-md">
                  Titular do Lote
                </span>
              </div>
            )}
          </div>

          {/* Step 2: Document Type Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              2. Tipo de Documento a Escanear
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1.5 no-scrollbar">
              {DOCUMENT_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategoryConfig(cat);
                    setPages([]);
                    setActivePageSlot('front');
                  }}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer flex items-center gap-1.5 ${
                    selectedCategoryConfig.id === cat.id
                      ? 'bg-[#0f5964] text-white border-[#0f5964] shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Camera Viewfinder & Page Slots */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Viewfinder Column */}
            <div className="lg:col-span-7 flex flex-col items-center">
              <div className="relative w-full aspect-4/3 sm:aspect-16/10 bg-slate-950 rounded-2xl overflow-hidden border-2 border-slate-800 shadow-inner flex items-center justify-center">
                {/* Live Video Element */}
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
                />

                {/* Guide Overlays */}
                {cameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                    {/* Reticle guide frame */}
                    <div
                      className={`border-2 border-dashed border-teal-400/80 rounded-xl transition-all shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] ${
                        selectedCategoryConfig.mode === 'two_sided'
                          ? 'w-[85%] aspect-16/10 max-w-sm'
                          : 'w-[75%] aspect-1/1.4 max-w-xs'
                      }`}
                    >
                      <div className="absolute top-2 left-2 text-[10px] font-bold tracking-wider text-teal-300 bg-slate-900/80 px-2 py-0.5 rounded backdrop-blur-xs">
                        {selectedCategoryConfig.mode === 'two_sided'
                          ? activePageSlot === 'front'
                            ? 'ENQUADRE A FRENTE DO RG'
                            : 'ENQUADRE O VERSO DO RG'
                          : 'ENQUADRE O DOCUMENTO'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Camera Fallback / Error State */}
                {!cameraActive && (
                  <div className="p-6 text-center text-slate-400 space-y-3">
                    <Camera className="w-10 h-10 mx-auto text-slate-600" />
                    <p className="text-xs max-w-xs mx-auto">
                      {cameraError || 'Câmera desligada. Clique abaixo para ativar ou escolha da galeria.'}
                    </p>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                    >
                      Ativar Câmera
                    </button>
                  </div>
                )}

                {/* Viewfinder Controls Overlay */}
                {cameraActive && (
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    {hasTorch && (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`p-2 rounded-full backdrop-blur-md transition cursor-pointer ${
                          torchOn ? 'bg-amber-400 text-slate-950' : 'bg-slate-900/60 text-white hover:bg-slate-900/80'
                        }`}
                        title="Lanterna / Flash"
                      >
                        {torchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={toggleFacingMode}
                      className="p-2 rounded-full bg-slate-900/60 hover:bg-slate-900/80 text-white backdrop-blur-md transition cursor-pointer"
                      title="Alternar Câmera"
                    >
                      <SwitchCamera className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons below Viewfinder */}
              <div className="w-full mt-3 flex items-center justify-center gap-3">
                {/* Shutter Button */}
                <button
                  type="button"
                  onClick={captureSnapshot}
                  disabled={!cameraActive}
                  className="px-6 py-3 rounded-2xl bg-[#0f5964] hover:bg-[#0c4750] disabled:opacity-40 text-white font-bold text-sm shadow-md flex items-center gap-2 transition transform active:scale-95 cursor-pointer"
                >
                  <Camera className="w-5 h-5 text-teal-300" />
                  Capturar {selectedCategoryConfig.mode === 'two_sided' ? (activePageSlot === 'front' ? 'Frente' : 'Verso') : 'Página'}
                </button>

                {/* Gallery Upload Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm shadow-2xs flex items-center gap-2 transition cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-slate-500" />
                  Galeria / Arquivo
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple={selectedCategoryConfig.mode !== 'single_page'}
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>

            {/* Captured Pages & Analysis Column */}
            <div className="lg:col-span-5 flex flex-col space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span>Páginas Capturadas ({pages.length})</span>
                {isAnalyzing && (
                  <span className="flex items-center gap-1 text-[11px] text-teal-700 font-medium animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Analisando com OCR...
                  </span>
                )}
              </h3>

              {/* Pages Grid */}
              <div className="grid grid-cols-2 gap-2.5 max-h-56 overflow-y-auto p-1">
                {pages.length === 0 ? (
                  <div className="col-span-2 p-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-xs text-slate-400 space-y-1">
                    <FileText className="w-6 h-6 mx-auto text-slate-400" />
                    <p>Nenhuma página capturada ainda.</p>
                    <p className="text-[11px]">Enquadre o documento e aperte "Capturar".</p>
                  </div>
                ) : (
                  pages.map((p) => (
                    <div key={p.id} className="relative rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shadow-2xs group">
                      <div className="aspect-16/10 w-full overflow-hidden bg-slate-900 flex items-center justify-center">
                        <img
                          src={p.dataUrl}
                          alt={p.label}
                          style={{
                            transform: `rotate(${p.rotation}deg)`,
                            filter: p.filter === 'scanner' ? 'contrast(200%) grayscale(100%)' : p.filter === 'grayscale' ? 'grayscale(100%)' : 'none',
                          }}
                          className="w-full h-full object-cover transition-all"
                        />
                      </div>

                      <div className="p-1.5 flex items-center justify-between bg-white text-xs">
                        <span className="font-semibold text-slate-700 text-[11px]">{p.label}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => rotatePage(p.id)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-500 transition cursor-pointer"
                            title="Girar 90 graus"
                          >
                            <RotateCw className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removePage(p.id)}
                            className="p-1 rounded hover:bg-red-50 text-red-500 transition cursor-pointer"
                            title="Excluir página"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Extracted OCR Information Card */}
              {extractedData && (
                <div className="p-3 rounded-xl bg-teal-50/80 border border-teal-200 text-xs space-y-2">
                  <div className="flex items-center justify-between font-bold text-teal-900 text-xs">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                      Dados Extraídos Automaticamente
                    </span>
                    <span className="text-[10px] bg-teal-200/80 text-teal-900 px-2 py-0.5 rounded-full">
                      {(extractedData.confidence * 100).toFixed(0)}% precisão
                    </span>
                  </div>

                  <div className="space-y-1 text-slate-700 text-[11px]">
                    {extractedData.name && (
                      <p><span className="text-slate-500 font-medium">Nome:</span> <strong className="text-slate-900">{extractedData.name}</strong></p>
                    )}
                    {extractedData.cpf && (
                      <p><span className="text-slate-500 font-medium">CPF:</span> <strong className="text-teal-950 font-mono">{extractedData.cpf}</strong></p>
                    )}
                    {extractedData.rg && (
                      <p><span className="text-slate-500 font-medium">RG:</span> <strong className="text-slate-800 font-mono">{extractedData.rg} {extractedData.rgIssuer || ''}</strong></p>
                    )}
                    {extractedData.birthDate && (
                      <p><span className="text-slate-500 font-medium">Data Nasc.:</span> <strong>{extractedData.birthDate}</strong></p>
                    )}
                  </div>

                  {/* Suggestion action if person matched */}
                  {matchedEntity?.person && (
                    <div className="pt-2 border-t border-teal-200/80 flex items-center justify-between">
                      <span className="text-[11px] text-teal-900 font-medium">
                        Vincular a {matchedEntity.person.fullName}?
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPerson(matchedEntity.person);
                          if (matchedEntity.lot) {
                            setSelectedProjectId(matchedEntity.lot.projectId);
                            setSelectedBlockId(matchedEntity.lot.blockId);
                            setSelectedLotId(matchedEntity.lot.id);
                          }
                        }}
                        className="px-2 py-1 rounded bg-teal-700 text-white font-semibold text-[10px] hover:bg-teal-800 transition cursor-pointer"
                      >
                        Confirmar Vínculo
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Cadastral Update Checkbox */}
              {selectedPerson && extractedData && (
                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updatePersonData}
                    onChange={(e) => setUpdatePersonData(e.target.checked)}
                    className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                  />
                  <span>Atualizar CPF/RG de <strong>{selectedPerson.fullName}</strong> no cadastro</span>
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-4 py-3 sm:px-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 text-xs sm:text-sm font-semibold transition cursor-pointer"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            {uploadSuccess && (
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 animate-bounce">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Salvo e vinculado com sucesso!
              </span>
            )}

            <button
              type="button"
              onClick={handleSaveDocument}
              disabled={pages.length === 0 || isUploading}
              className="px-5 py-2.5 rounded-xl bg-[#0f5964] hover:bg-[#0c4750] disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-md flex items-center gap-2 transition cursor-pointer"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processando e Vinculando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Salvar Documento ({pages.length} {pages.length === 1 ? 'página' : 'páginas'})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

