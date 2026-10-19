import Icon from '../ui/Icon';

export const matchSteps = [
  {
    label: 'Compañero',
    icon: 'paw',
    title: 'Qué compañero buscás',
    description:
      'Cada gran historia empieza con una conexión. Podés elegir más de una opción.',
  },
  {
    label: 'Tu ritmo',
    icon: 'sun',
    title: 'Tu ritmo de vida',
    description:
      'Contanos cómo son tus días. Buscamos una compañía que pueda disfrutar tu rutina.',
  },
  {
    label: 'Tu hogar',
    icon: 'home',
    title: 'Cómo es tu hogar',
    description:
      'Un hogar es mucho más que sus metros cuadrados. Pensemos en sus espacios y su seguridad.',
  },
  {
    label: 'Convivencia',
    icon: 'people',
    title: 'Con quién conviviría',
    description:
      'Cada integrante cuenta. Conocer quiénes viven con vos nos ayuda a cuidar el encuentro.',
  },
  {
    label: 'Cuidados',
    icon: 'heart',
    title: 'Los cuidados que podés ofrecer',
    description:
      'No hay respuestas perfectas. Lo importante es conocer el tiempo y el acompañamiento que podés dar.',
  },
  {
    label: 'Afinidades',
    icon: 'spark',
    title: 'Lo que te gustaría compartir',
    description:
      'Esos pequeños detalles que hacen que dos mundos se encuentren. Tus preferencias orientan la búsqueda.',
  },
  {
    label: 'Tu historia',
    icon: 'chat',
    title: 'Antes de encontrarnos',
    description:
      'Sumá lo que quieras contarnos. Lo desconocido queda pendiente de confirmar y la decisión siempre es humana.',
  },
] as const;

export default function MatchProgress({
  step,
  visited,
  onChange,
}: {
  step: number;
  visited: number[];
  onChange: (step: number) => void;
}) {
  return (
    <nav className="match-steps" aria-label="Pasos de búsqueda inteligente">
      <ol>
        {matchSteps.map((item, index) => (
          <li key={item.label}>
            <button
              type="button"
              aria-current={index === step ? 'step' : undefined}
              aria-label={`Paso ${index + 1}: ${item.label}`}
              className={visited.includes(index) ? 'is-visited' : ''}
              onClick={() => onChange(index)}
            >
              <span className="match-step-symbol">
                <Icon name={item.icon} />
              </span>
              <span className="match-step-name">
                <small>0{index + 1}</small>
                {item.label}
              </span>
              <span className="match-step-track" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
