export type Species = 'dog' | 'cat';
export type Stage = 'young' | 'adult' | 'senior';
export interface Pet {
  id: string;
  name: string;
  species: Species;
  age: string;
  months: number;
  stage: Stage;
  size: 'Pequeño' | 'Mediano' | 'Grande';
  sex: 'Macho' | 'Hembra';
  location: string;
  tag: string;
  tagIcon: string;
  tagColor: string;
  energy: number;
  pos: string;
  quote: string;
  traits: string[];
  story: string;
  needs: string;
  dogs: string;
  cats: string;
  children: string;
  smallSpace: boolean;
  care: string[];
  alt: string;
}
