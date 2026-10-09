import { useEffect, useRef, useState } from 'react';
import { pets } from '../../data/pets';
import { petPhoto, petUrl } from '../../config/site';
import { matchPets, questions, type Answers } from '../../features/match/rules';
import Icon from '../ui/Icon';
import { useClientState } from '../../features/preferences/useClientState';
export default function MatchQuiz() {
  const ready = useClientState();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>([null, null, null]);
  const title = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) title.current?.focus({ preventScroll: true });
    else mounted.current = true;
  }, [step]);
  const question = questions[step];
  const reset = () => {
    setAnswers([null, null, null]);
    setStep(0);
  };
  return (
    <div className="interactive-panel quiz-page">
      <div className="eyebrow">
        <Icon name="spark" className="icon-sm" />
        ¿Quién va con vos?
      </div>
      {step < 3 ? (
        <>
          <div className="quiz-progress" aria-hidden="true">
            {questions.map((_, i) => (
              <span key={i} className={i <= step ? 'on' : ''} />
            ))}
          </div>
          <p className="quiz-step-label">Pregunta {step + 1} de 3</p>
          <h2 ref={title} tabIndex={-1}>
            {question.title}
          </h2>
          <div
            className="quiz-options"
            role="group"
            aria-label="Elegí una respuesta"
          >
            {question.options.map(([value, icon, label, description]) => (
              <button
                disabled={!ready}
                key={value}
                className={`quiz-option ${answers[step] === value ? 'selected' : ''}`}
                aria-pressed={answers[step] === value}
                onClick={() =>
                  setAnswers(
                    (current) =>
                      current.map((answer, i) =>
                        i === step ? value : answer,
                      ) as Answers,
                  )
                }
              >
                <Icon name={icon} />
                <span>
                  <b>{label}</b>
                  <small>{description}</small>
                </span>
                <span className="choice-dot" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="quiz-navigation">
            <button
              className="text-link"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              <Icon name="left" className="icon-sm" />
              Volver
            </button>
            <button
              className="btn btn-dark"
              disabled={!answers[step]}
              onClick={() => setStep(step + 1)}
            >
              {step === 2 ? 'Ver mis afinidades' : 'Seguimos'}
              <Icon name="arrow" className="icon-sm" />
            </button>
          </div>
          <p className="quiz-footnote">
            Tus respuestas se usan solo durante este recorrido. No se envían ni
            se guardan.
          </p>
        </>
      ) : (
        <>
          <h2 ref={title} tabIndex={-1}>
            Estas historias
            <br />
            podrían ir con vos.
          </h2>
          <p className="dialog-intro">
            Elegimos perfiles de muestra según la especie, el ritmo de vida y la
            prioridad que marcaste. Ahora vale la pena conocer sus necesidades.
          </p>
          {matchPets(pets, answers).map((p) => (
            <a key={p.id} className="quiz-result-card" href={petUrl(p.id)}>
              <img
                src={petPhoto(p.id, 480)}
                alt={p.alt}
                width="480"
                height="480"
                loading="lazy"
              />
              <span>
                <h3>{p.name}</h3>
                <p>
                  {p.age} · {p.location}
                </p>
                <p>
                  {p.energy <= 2
                    ? 'Un ritmo más tranquilo'
                    : p.energy >= 4
                      ? 'Disfruta una rutina activa'
                      : 'Combina juego y descanso'}
                </p>
              </span>
              <Icon name="arrow-up" />
            </a>
          ))}
          <p className="quiz-footnote">
            Esta orientación usa reglas simples de afinidad. No es una
            evaluación de compatibilidad ni una garantía. La convivencia y las
            necesidades se conversan con los responsables del animal.
          </p>
          <button className="text-link" onClick={reset}>
            Volver a empezar <Icon name="arrow" />
          </button>
        </>
      )}
    </div>
  );
}
