import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido'),
  password: z.string().min(1, 'Informe sua senha'),
  remember: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      remember: false,
    },
  });

  async function onSubmit(data: LoginForm) {
    setAuthError(null);
    try {
      const response = await axios.post('/api/auth/login', data);
      const { token, refreshToken, user } = response.data.data;
      auth.login({ token, refreshToken, user }, !!data.remember);
      navigate('/');
    } catch (error: unknown) {
      console.error('Falha ao autenticar:', error);
      if (axios.isAxiosError(error)) {
        const serverMessage = error.response?.data?.message;
        setAuthError(serverMessage || 'Falha ao autenticar. Verifique seu e-mail e senha.');
      } else {
        setAuthError('Ocorreu um erro ao tentar acessar. Tente novamente em instantes.');
      }
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col justify-center items-center bg-[#edf2f4] px-4 py-8 antialiased dark:bg-slate-950">
      <main className="w-full max-w-[410px]">
        <div className="rounded-[8px] border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          {/* Logo institucional oficial */}
          <div className="mb-6 flex justify-center">
            <img
              src="/genesis-logo.png"
              alt="Gênesis Engenharia e Consultoria"
              className="h-14 sm:h-16 w-auto max-w-[240px] object-contain"
            />
          </div>

          {/* Cabeçalho do formulário */}
          <div className="mb-6">
            <span className="block text-xs font-semibold tracking-wider text-[#137a7f] uppercase dark:text-[#2dd4bf]">
              GÊNESIS REURB
            </span>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Acesse sua conta
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Entre para acessar o sistema de gestão.
            </p>
          </div>

          {/* Alerta de erro de autenticação com alto contraste e acessibilidade */}
          {authError && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-5 rounded-[8px] border border-red-200 bg-red-50 p-3.5 text-sm font-medium text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300"
            >
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* Campo E-mail */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200"
              >
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="nome@empresa.com.br"
                {...register('email')}
                className="h-12 min-h-[48px] w-full rounded-[8px] border border-slate-300 bg-white px-3.5 text-base text-slate-900 outline-none transition focus:border-[#137a7f] focus:ring-1 focus:ring-[#137a7f] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-[#2dd4bf] dark:focus:ring-[#2dd4bf]"
                aria-invalid={errors.email ? 'true' : 'false'}
                aria-describedby={errors.email ? 'email-error' : undefined}
              />
              {errors.email && (
                <p id="email-error" className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Campo Senha */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200"
              >
                Senha
              </label>
              <div className="flex gap-2">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  {...register('password')}
                  className="h-12 min-h-[48px] flex-1 min-w-0 rounded-[8px] border border-slate-300 bg-white px-3.5 text-base text-slate-900 outline-none transition focus:border-[#137a7f] focus:ring-1 focus:ring-[#137a7f] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-[#2dd4bf] dark:focus:ring-[#2dd4bf]"
                  aria-invalid={errors.password ? 'true' : 'false'}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                  className="h-12 min-h-[48px] shrink-0 rounded-[8px] border border-slate-300 bg-white px-4 text-sm font-medium text-[#137a7f] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#137a7f]/20 cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:text-[#2dd4bf] dark:hover:bg-slate-700"
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Lembrar acesso */}
            <div className="pt-1">
              <label className="inline-flex cursor-pointer select-none items-center gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  {...register('remember')}
                  className="h-4 w-4 rounded-[4px] border-slate-300 text-[#137a7f] focus:ring-[#137a7f] cursor-pointer dark:border-slate-600 dark:bg-slate-800"
                />
                <span>Lembrar acesso neste dispositivo</span>
              </label>
            </div>

            {/* Botão Entrar */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-12 min-h-[48px] w-full rounded-[8px] bg-[#137a7f] px-4 text-base font-semibold text-white shadow-sm transition hover:bg-[#0f686c] active:bg-[#0c5155] focus:outline-none focus:ring-2 focus:ring-[#137a7f]/40 disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
              >
                {isSubmitting ? 'Entrando…' : 'Entrar'}
              </button>
            </div>
          </form>
        </div>

        {/* Rodapé institucional */}
        <footer className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Gênesis · Engenharia e Consultoria
        </footer>
      </main>
    </div>
  );
}
