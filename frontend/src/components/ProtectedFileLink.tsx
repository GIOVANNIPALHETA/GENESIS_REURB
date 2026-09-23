import React, { useState } from 'react';
import axios from 'axios';

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function ProtectedFileLink({ href, children, onClick, ...props }: Props) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function openFile(event: React.MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/uploads/')) throw new Error('Endereço de arquivo inválido.');
      const response = await axios.get(url.pathname, { responseType: 'blob' });
      const disposition = response.headers['content-disposition'] || '';
      const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
      const filename = encodedName ? decodeURIComponent(encodedName) : /filename="([^"]+)"/i.exec(disposition)?.[1] || url.pathname.split('/').pop() || 'documento';
      const objectUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch {
      setError('Não foi possível baixar o arquivo. Verifique seu acesso e tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return <><a {...props} href={href} onClick={openFile} aria-busy={busy}>{busy ? 'Baixando…' : children}</a>{error && <span role="alert" className="block text-xs text-red-600">{error}</span>}</>;
}
