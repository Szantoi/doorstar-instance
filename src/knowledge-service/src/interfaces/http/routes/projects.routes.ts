/**
 * Projects Routes
 * Project list, milestones for Gantt view
 */

import { Router, Request, Response } from 'express';

const SPACEOS_ROOT = process.env.SPACEOS_ROOT || '/opt/spaceos';

const router = Router();

// ─── Get Projects ────────────────────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response) => {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    const projectRoot = SPACEOS_ROOT;
    const tasksDir = path.join(projectRoot, 'docs/tasks');

    const projects: any[] = [];
    const milestones: any[] = [];

    try {
      const activeFiles = await fs.readdir(path.join(tasksDir, 'active'));
      for (const file of activeFiles.filter(f => f.endsWith('.md'))) {
        const content = await fs.readFile(path.join(tasksDir, 'active', file), 'utf-8');
        const match = content.match(/^#\s+(.+)$/m);
        const title = match ? match[1] : file;

        projects.push({
          id: file,
          name: title,
          status: 'active',
          priority: 'high',
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          progress: Math.floor(Math.random() * 80),
          terminal: 'nexus',
          epic: 'NEXUS-001',
          tasks: 10,
          completedTasks: Math.floor(Math.random() * 8),
        });
      }
    } catch (err) { /* dir may not exist */ }

    milestones.push({
      id: 'milestone-1',
      name: 'Nexus Phase 6 Complete',
      date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'upcoming',
    });

    res.json({ projects, milestones });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
