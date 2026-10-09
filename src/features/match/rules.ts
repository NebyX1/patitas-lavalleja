import type { Pet } from '../../types/pet';
export type Answers = [string | null, string | null, string | null];
export function matchPets(pets: Pet[], answers: Answers) {
  const [species, energy, priority] = answers;
  const desired =
    { calm: 1, balanced: 3, active: 5 }[energy ?? 'balanced'] ?? 3;
  return pets
    .filter((p) => species === 'any' || p.species === species)
    .map((p) => ({
      pet: p,
      score:
        10 -
        Math.abs(p.energy - desired) * 2 +
        (priority === 'small' && p.smallSpace ? 3 : 0) +
        (priority === 'senior' && p.stage === 'senior' ? 5 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((result) => result.pet);
}
export const questions = [
  {
    title: '¿Con quién te imaginás compartiendo tu casa?',
    options: [
      [
        'dog',
        'dog',
        'Un perro',
        'Paseos, compañía y una colita que te recibe.',
      ],
      ['cat', 'cat', 'Un gato', 'Ronroneos, curiosidad y mimos a su manera.'],
      [
        'any',
        'paw',
        'Estoy abierto a descubrir',
        'Lo importante es encontrar una buena conexión.',
      ],
    ],
  },
  {
    title: '¿Cuál de estos planes se parece más a vos?',
    options: [
      [
        'calm',
        'leaf',
        'Una tarde sin apuro',
        'Paseos suaves y mucho tiempo tranquilo.',
      ],
      [
        'balanced',
        'sun',
        'Un poco de todo',
        'Moverse, jugar y también descansar.',
      ],
      [
        'active',
        'spark',
        'Salir a explorar',
        'Caminatas, juego y una rutina muy activa.',
      ],
    ],
  },
  {
    title: '¿Qué te gustaría priorizar en este encuentro?',
    options: [
      [
        'small',
        'home',
        'Un compañero para un espacio pequeño',
        'Con rutinas y paseos adecuados a sus necesidades.',
      ],
      [
        'senior',
        'heart',
        'Darle una oportunidad a un adulto mayor',
        'Valoro la calma y los vínculos que crecen despacio.',
      ],
      [
        'flexible',
        'paw',
        'Conocer historias sin limitarme',
        'Podemos conversar y descubrir qué necesita cada uno.',
      ],
    ],
  },
];
