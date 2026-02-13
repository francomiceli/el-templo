import type { SessionBlock } from './session';

export interface LevelBlock {
  sessionId: number;
  memberLevel: string;
  block: SessionBlock;
}

export interface BlockGroup {
  role: string;
  sortOrder: number;
  formatId: number;
  formatName: string;
  formatParams: Record<string, unknown> | null;
  levelBlocks: LevelBlock[];
}
