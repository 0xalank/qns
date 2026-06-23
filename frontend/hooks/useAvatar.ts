'use client';

import { useEffect, useState } from 'react';
import { ResolvedAvatar, resolveAvatar } from '@/lib/avatar';

interface AvatarState {
  loading: boolean;
  avatar: ResolvedAvatar;
}

const EMPTY_AVATAR: ResolvedAvatar = { kind: 'empty' };

export function useResolvedAvatar(avatarHex?: string, ownerAddress?: string): AvatarState {
  const [state, setState] = useState<AvatarState>({
    loading: false,
    avatar: EMPTY_AVATAR,
  });

  useEffect(() => {
    let cancelled = false;

    if (!avatarHex || avatarHex === '0x') {
      setState({ loading: false, avatar: EMPTY_AVATAR });
      return;
    }

    setState((current) => ({ loading: true, avatar: current.avatar }));

    resolveAvatar(avatarHex, ownerAddress)
      .then((avatar) => {
        if (!cancelled) setState({ loading: false, avatar });
      })
      .catch((error: any) => {
        if (!cancelled) {
          setState({
            loading: false,
            avatar: {
              kind: 'error',
              error: error?.message || 'Could not resolve avatar.',
            },
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [avatarHex, ownerAddress]);

  return state;
}
