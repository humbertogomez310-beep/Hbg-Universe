export type Role = 'OWNER' | 'USER' | 'SYSTEM';

export type Permission =
  | 'apps:register'
  | 'apps:heartbeat'
  | 'events:publish'
  | 'events:receive'
  | 'services:register'
  | 'universe.code.modify'
  | 'terminador:command:safe'
  | 'terminador:command:destructive';

export const ROLE_DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: [
    'apps:register',
    'apps:heartbeat',
    'events:publish',
    'events:receive',
    'services:register',
    'universe.code.modify',
    'terminador:command:safe',
    'terminador:command:destructive',
  ],
  SYSTEM: [
    'apps:register',
    'apps:heartbeat',
    'events:publish',
    'events:receive',
    'services:register',
    'terminador:command:safe',
  ],
  USER: ['apps:heartbeat', 'events:publish', 'events:receive', 'terminador:command:safe'],
};

export const CRITICAL_PERMISSIONS: Permission[] = ['universe.code.modify', 'terminador:command:destructive'];
