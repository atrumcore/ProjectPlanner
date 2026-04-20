import { useMemo } from 'react';
import type { Swimlane, Section } from '../types/gantt';

export interface SectionWithLanes {
  section: Section;
  lanes: Swimlane[];
}

export function useSectionedLanes(sections: Section[], swimlanes: Swimlane[]): SectionWithLanes[] {
  return useMemo(() => {
    const sorted = [...sections].sort((a, b) => a.order - b.order);
    return sorted.map(section => ({
      section,
      lanes: swimlanes
        .filter(s => s.section === section.id)
        .sort((a, b) => a.order - b.order),
    }));
  }, [sections, swimlanes]);
}
