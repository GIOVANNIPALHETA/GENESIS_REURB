import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, breadcrumb, children }: PageHeaderProps) {
  return (
    <div className="mb-6 space-y-2">
      {breadcrumb && (
        <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
          {breadcrumb}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-bold text-slate-900 tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {children && (
          <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap shrink-0">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
