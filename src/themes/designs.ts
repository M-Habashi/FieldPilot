export interface DesignMeta {
  id: string;
  label: string;
  tagline: string;
}

export const DESIGNS: DesignMeta[] = [
  { id: 'blueprint', label: 'Blueprint', tagline: 'Crisp, technical, drafting-table precision' },
  { id: 'studio', label: 'Studio', tagline: 'Warm paper, soft depth, high-vis accents' },
  { id: 'carbon', label: 'Carbon', tagline: 'Editorial black & white, caution-tape focus' },
];
