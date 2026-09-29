import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onSessionExpired, session } from '../api/client';
import { queryKeys } from '../api/queries';
import type { AuthPayload, OnboardingStatus, User } from '../api/types';

interface AuthContextValue {
  user: User | null;
  setUser: (user: User) => void;
  /** Mở phiên từ phản hồi đăng nhập/đăng ký/khôi phục. Trả `true` khi sẽ mở slide chào mừng cho người mới, để nơi gọi
   * không bật thêm thông báo đè lên. */
  enter: (data: AuthPayload) => Promise<boolean>;
  /** Xóa phiên phía trình duyệt và quay về màn đăng nhập (không gọi API). */
  leave: () => void;
  /** Slide chào mừng cần mở ngay sau khi vào ứng dụng. */
  welcomeRequested: boolean;
  consumeWelcome: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUserState] = useState<User | null>(null);
  const [welcomeRequested, setWelcomeRequested] = useState(false);

  const leave = useCallback(() => {
    session.token = '';
    session.refreshToken = '';
    setUserState(null);
    setWelcomeRequested(false);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => onSessionExpired(leave), [leave]);

  const enter = useCallback(
    async (data: AuthPayload) => {
      session.token = data.accessToken;
      session.refreshToken = data.refreshToken;
      const onboarding = await api<OnboardingStatus>('/profile/onboarding');
      queryClient.setQueryData(queryKeys.onboarding, onboarding);
      const showWelcome = !onboarding.completed && !onboarding.dismissed && !onboarding.welcomeSeen;
      setWelcomeRequested(showWelcome);
      setUserState(data.user);
      return showWelcome;
    },
    [queryClient]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      setUser: setUserState,
      enter,
      leave,
      welcomeRequested,
      consumeWelcome: () => setWelcomeRequested(false)
    }),
    [user, enter, leave, welcomeRequested]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth phải nằm trong AuthProvider');
  return value;
}

/** Người dùng đã đăng nhập (chỉ dùng bên trong ứng dụng sau đăng nhập). */
export function useUser() {
  const { user } = useAuth();
  if (!user) throw new Error('Chưa đăng nhập');
  return user;
}
