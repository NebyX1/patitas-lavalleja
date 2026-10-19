import { useEffect, useRef, useState } from 'react';
import { navigate } from 'astro:transitions/client';
import {
  emptyProfile,
  validMatchResults,
  type AdopterProfile,
  type MatchResults,
} from '../../features/match/profile';
import { api, errorMessage } from '../../lib/api';
import { useSession } from '../../features/auth/store';
import { loginHref } from '../../features/auth/navigation';
import { useClientState } from '../../features/preferences/useClientState';
import Icon from '../ui/Icon';
import MatchProgress, { matchSteps } from '../match/MatchProgress';
import MatchChoices from '../match/MatchChoices';
import MatchSummary from '../match/MatchSummary';
import MatchResultsView from '../match/MatchResults';
import MatchRoutineField from '../match/MatchRoutineField';
import MatchProcessingDialog from '../match/MatchProcessingDialog';
import {
  presentationPause,
  validProcessingEvent,
  type SearchProcessing,
} from '../../features/match/processing';
const steps = matchSteps.map((step) => step.title);
const choiceLabels: Partial<Record<keyof AdopterProfile, string>> = {
  species: 'Especies que te interesan',
  stages: 'Etapas de vida',
  sizes: 'Tamaño preferido',
  activity_level: 'Tu nivel de actividad',
  housing_type: 'Tipo de vivienda',
  secure_outdoor: 'Espacio exterior seguro',
  household_animals: 'Otros animales en el hogar',
  children_age_groups: 'Niños y adolescentes',
  experience: 'Tu experiencia',
  training_commitment: 'Tiempo para adaptación y entrenamiento',
  special_care_capacity: 'Cuidados especiales',
  preferred_traits: 'Tus afinidades',
  flexibility: 'Flexibilidad para encontrar al compañero',
};
export default function MatchQuiz() {
  const session = useSession();
  useEffect(() => {
    if (session && !session.authenticated)
      void navigate(loginHref('/tu-match/'), { history: 'replace' });
  }, [session?.authenticated]);
  if (!session)
    return (
      <div className="interactive-panel">
        <p role="status">Buscando tu sesión…</p>
      </div>
    );
  if (!session.authenticated || !session.user)
    return (
      <div className="interactive-panel quiz-page">
        <span className="eyebrow">
          <Icon name="spark" /> Búsqueda inteligente
        </span>
        <p role="status">Te llevamos al inicio de sesión…</p>
        <a className="btn btn-orange" href={loginHref('/tu-match/')}>
          Iniciar sesión <Icon name="arrow-up" />
        </a>
      </div>
    );
  return <MatchQuizForm key={session.user.id} />;
}

function MatchQuizForm() {
  const ready = useClientState();
  const session = useSession();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<AdopterProfile>({ ...emptyProfile });
  const [result, setResult] = useState<MatchResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [visited, setVisited] = useState<number[]>([0]);
  const [processing, setProcessing] = useState<SearchProcessing | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const question = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) {
      title.current?.focus({ preventScroll: true });
      const headerHeight =
        document.querySelector('.header')?.getBoundingClientRect().height ??
        100;
      const anchor = !result
        ? question.current
            ?.closest('.match-studio')
            ?.querySelector('.match-steps')
        : question.current;
      if (anchor)
        window.scrollTo({
          top: Math.max(
            0,
            anchor.getBoundingClientRect().top + scrollY - headerHeight - 20,
          ),
          behavior:
            matchMedia('(prefers-reduced-motion: reduce)').matches ||
            document.documentElement.dataset.motion === 'paused'
              ? 'instant'
              : 'smooth',
        });
    } else mounted.current = true;
  }, [step, result]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    controller.current?.abort();
    setProfile({ ...emptyProfile });
    setResult(null);
    setStep(0);
    setSaved(false);
    setError('');
    setBusy(false);
    setVisited([0]);
    setProcessing(null);
  }, [session?.user?.id]);
  function goToStep(next: number) {
    setVisited((current) =>
      current.includes(next) ? current : [...current, next],
    );
    setStep(next);
  }
  const set = <K extends keyof AdopterProfile>(
    key: K,
    value: AdopterProfile[K],
  ) => {
    setSaved(false);
    setProfile((current) => ({ ...current, [key]: value }));
  };
  const multiple = (
    key:
      | 'species'
      | 'sizes'
      | 'stages'
      | 'household_animals'
      | 'children_age_groups'
      | 'preferred_traits',
    value: string,
  ) =>
    set(
      key,
      profile[key].includes(value)
        ? profile[key].filter((item) => item !== value)
        : [...profile[key], value],
    );
  const choices = (
    key: keyof AdopterProfile,
    values: [string, string, string][],
    multi = false,
  ) => (
    <MatchChoices
      field={key}
      values={values}
      value={profile[key]}
      multi={multi}
      disabled={!ready || busy}
      label={choiceLabels[key] ?? steps[step]}
      onSelect={(value) => {
        if (multi) multiple(key as 'species', value);
        else
          set(
            key,
            (value === 'null'
              ? null
              : value === 'true'
                ? true
                : value === 'false'
                  ? false
                  : [
                        'activity_level',
                        'training_commitment',
                        'flexibility',
                      ].includes(key)
                    ? Number(value)
                    : value) as never,
          );
      }}
    />
  );
  const number = (
    key: 'activity_minutes' | 'hours_away',
    label: string,
    max: number,
  ) => (
    <MatchRoutineField
      label={label}
      value={profile[key]}
      max={max}
      hours={key === 'hours_away'}
      onChange={(value) => set(key, value)}
    />
  );
  const evaluate = async (candidate = profile) => {
    controller.current?.abort();
    const searchController = new AbortController();
    controller.current = searchController;
    const startedAt = performance.now();
    setProcessing({ phase: 'working', stages: {}, startedAt });
    setBusy(true);
    setError('');
    try {
      const data = await api<MatchResults>('/matches/search', {
        method: 'POST',
        headers: { Accept: 'application/x-ndjson' },
        body: {
          profile: candidate,
          query: candidate.preferences_text,
          limit: 12,
        },
        signal: searchController.signal,
        onEvent: (event) => {
          if (validProcessingEvent(event) && !searchController.signal.aborted)
            setProcessing((current) =>
              current
                ? {
                    ...current,
                    stages: { ...current.stages, [event.stage]: event },
                  }
                : null,
            );
        },
        validate: validMatchResults,
      });
      // Give fast/cached searches a brief, readable transition without delaying inference.
      await presentationPause(
        Math.max(0, 1400 - (performance.now() - startedAt)),
        searchController.signal,
      );
      setProcessing((current) =>
        current ? { ...current, phase: 'complete', result: data } : null,
      );
      await presentationPause(800, searchController.signal);
      if (!searchController.signal.aborted) {
        setProcessing(null);
        setResult(data);
      }
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) {
        const message = errorMessage(failure);
        setError(message);
        setProcessing((current) =>
          current ? { ...current, phase: 'error', error: message } : null,
        );
      }
    } finally {
      if (controller.current === searchController) setBusy(false);
    }
  };
  const save = async () => {
    controller.current?.abort();
    controller.current = new AbortController();
    setBusy(true);
    setError('');
    try {
      await api('/me/profile', {
        method: 'PUT',
        body: profile,
        signal: controller.current.signal,
      });
      if (!controller.current.signal.aborted) setSaved(true);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  const load = async (runSearch = false) => {
    controller.current?.abort();
    controller.current = new AbortController();
    setBusy(true);
    setError('');
    try {
      const data = await api<{ profile: Partial<AdopterProfile> | null }>(
        '/me/profile',
        { signal: controller.current.signal },
      );
      if (controller.current.signal.aborted) return;
      if (data.profile) {
        const loaded = { ...emptyProfile, ...data.profile };
        setProfile(loaded);
        setSaved(true);
        if (runSearch) await evaluate(loaded);
      } else setError('Todavía no guardaste un perfil. Podés completarlo acá.');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`quiz-page match-studio${result ? ' has-results' : ''}`}>
      <div className="match-welcome">
        <div className="match-welcome-copy">
          <span className="match-welcome-icon">
            <Icon name="spark" />
          </span>
          <div>
            <span className="match-kicker">Patitas Intelligence</span>
            <p>
              Hola, {session?.user?.display_name.split('·')[0].trim()}.{' '}
              <strong>Hagamos lugar a una nueva historia.</strong>
            </p>
          </div>
        </div>
        {!result && (
          <div className="saved-match-actions">
            <button
              className="text-link"
              disabled={busy}
              onClick={() => void load()}
            >
              Usar mi perfil guardado
            </button>
            <button
              className="btn btn-dark"
              disabled={busy}
              onClick={() => void load(true)}
            >
              Buscar con mi perfil guardado <Icon name="spark" />
            </button>
          </div>
        )}
      </div>
      {error && (
        <p className="api-notice" role="alert">
          {error}
        </p>
      )}
      <fieldset className="quiz-fields" disabled={busy} aria-busy={busy}>
        <legend className="sr-only">Tu hogar y tus preferencias</legend>
        {!result && (
          <MatchProgress step={step} visited={visited} onChange={goToStep} />
        )}
        <div className="match-workspace">
          <div className="match-question" ref={question}>
            <div className="match-question-heading">
              <div>
                <p className="quiz-step-label">
                  {result
                    ? 'Afinidades para explorar'
                    : `Pregunta ${step + 1} de ${steps.length}`}
                </p>
                <h2 ref={title} tabIndex={-1}>
                  {result ? 'Estas historias podrían ir con vos.' : steps[step]}
                </h2>
              </div>
              <span className="match-question-number" aria-hidden="true">
                {result ? <Icon name="heart" /> : `0${step + 1}`}
              </span>
            </div>
            <p className="match-step-description">
              {result
                ? 'Afinidades entre tu hogar y sus necesidades. Un punto de partida para conocerse, con condiciones que pueden requerir una conversación.'
                : matchSteps[step].description}
            </p>
            {!result ? (
              <>
                <div className="match-step-content" key={step}>
                  {step === 0 && (
                    <>
                      {choices(
                        'species',
                        [
                          ['dog', 'Un perro', 'Paseos y compañía.'],
                          ['cat', 'Un gato', 'Curiosidad y mimos a su manera.'],
                          [
                            'other',
                            'Otras especies',
                            'Conocer otras formas de compartir.',
                          ],
                        ],
                        true,
                      )}
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={profile.species.length === 0}
                          onChange={() => set('species', [])}
                        />
                        Estoy abierto a descubrir cualquier especie
                      </label>
                      <div className="match-preferences-row">
                        <section aria-labelledby="match-stages">
                          <h3 id="match-stages">Etapas de vida</h3>
                          {choices(
                            'stages',
                            [
                              [
                                'young',
                                'Joven',
                                'Tiempo para acompañar su crecimiento.',
                              ],
                              [
                                'adult',
                                'Adulto',
                                'Una personalidad para seguir conociendo.',
                              ],
                              [
                                'senior',
                                'Mayor',
                                'Una nueva oportunidad y cuidados atentos.',
                              ],
                            ],
                            true,
                          )}
                        </section>
                        <section aria-labelledby="match-sizes">
                          <h3 id="match-sizes">Tamaño preferido</h3>
                          {choices(
                            'sizes',
                            [
                              ['Pequeño', 'Pequeño', ''],
                              ['Mediano', 'Mediano', ''],
                              ['Grande', 'Grande', ''],
                            ],
                            true,
                          )}
                        </section>
                      </div>
                    </>
                  )}
                  {step === 1 && (
                    <>
                      {choices('activity_level', [
                        [
                          '1',
                          'Una tarde sin apuro',
                          'Una rutina de actividad suave.',
                        ],
                        ['3', 'Un poco de todo', 'Actividad y descanso.'],
                        ['5', 'Salir a explorar', 'Paseos y juego a diario.'],
                        [
                          'null',
                          'Todavía no lo sé',
                          'Lo confirmaremos juntos.',
                        ],
                      ])}
                      <div className="form-grid">
                        {number(
                          'activity_minutes',
                          'Minutos diarios disponibles para paseos o juegos',
                          1440,
                        )}
                        {number(
                          'hours_away',
                          'Horas aproximadas fuera del hogar',
                          24,
                        )}
                      </div>
                    </>
                  )}
                  {step === 2 && (
                    <>
                      {choices('housing_type', [
                        [
                          'apartment',
                          'Apartamento',
                          'Importan el espacio seguro y las rutinas.',
                        ],
                        [
                          'house',
                          'Casa',
                          'Conoceremos las necesidades concretas del animal.',
                        ],
                        [
                          'rural',
                          'Entorno rural',
                          'También requiere cuidados y seguridad.',
                        ],
                        ['null', 'Otro / por confirmar', 'Lo conversaremos.'],
                      ])}
                      <h3>¿Hay un espacio exterior seguro?</h3>
                      {choices('secure_outdoor', [
                        ['true', 'Sí', 'Está protegido para evitar escapes.'],
                        [
                          'false',
                          'No',
                          'Podemos ofrecer paseos o juego adecuados.',
                        ],
                        [
                          'null',
                          'Necesito confirmarlo',
                          'La seguridad se evalúa para cada animal.',
                        ],
                      ])}
                      <p className="quiz-footnote">
                        El tamaño de un animal no determina por sí solo que
                        necesite patio.
                      </p>
                    </>
                  )}
                  {step === 3 && (
                    <>
                      <h3>Otros animales en el hogar</h3>
                      {choices(
                        'household_animals',
                        [
                          ['dogs', 'Perros', ''],
                          ['cats', 'Gatos', ''],
                          ['birds', 'Aves', ''],
                          ['rabbits', 'Conejos', ''],
                          ['small_mammals', 'Pequeños mamíferos', ''],
                          ['other_pets', 'Otras mascotas', ''],
                        ],
                        true,
                      )}
                      <p className="quiz-footnote">
                        Dejá sin marcar si no hay otros animales.
                      </p>
                      <h3>Niños y adolescentes</h3>
                      {choices(
                        'children_age_groups',
                        [
                          ['young_children', 'Niños pequeños', ''],
                          ['school_children', 'Niños en edad escolar', ''],
                          ['teenagers', 'Adolescentes', ''],
                        ],
                        true,
                      )}
                      <p className="quiz-footnote">
                        No pedimos nombres, fotos ni fechas de nacimiento. Si
                        aún falta confirmar quiénes convivirán, dejalo
                        pendiente.
                      </p>
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={profile.household_confirmed === true}
                          onChange={(event) =>
                            set(
                              'household_confirmed',
                              event.target.checked ? true : null,
                            )
                          }
                        />
                        <span>
                          Confirmé con quién conviviría. Si no marqué animales
                          ni niños, confirmé que no los hay.
                        </span>
                      </label>
                      <p className="quiz-footnote">
                        Si no confirmás este paso, la evaluación indicará que
                        falta revisar la convivencia.
                      </p>
                    </>
                  )}
                  {step === 4 && (
                    <>
                      <h3>Tu experiencia</h3>
                      {choices('experience', [
                        [
                          'none',
                          'Sería mi primera experiencia',
                          'Podemos aprender con orientación.',
                        ],
                        ['some', 'Ya compartí mi hogar con mascotas', ''],
                        [
                          'experienced',
                          'Tengo experiencia acompañando adaptaciones',
                          '',
                        ],
                        ['null', 'Prefiero conversarlo', ''],
                      ])}
                      <h3>Tiempo para adaptación y entrenamiento</h3>
                      {choices('training_commitment', [
                        [
                          '1',
                          'Disponibilidad limitada',
                          'Necesito una rutina sencilla.',
                        ],
                        ['3', 'Puedo acompañar una adaptación', ''],
                        ['5', 'Puedo dedicar tiempo sostenido', ''],
                        ['null', 'Necesito evaluarlo', ''],
                      ])}
                      <h3>Cuidados especiales</h3>
                      {choices('special_care_capacity', [
                        [
                          'true',
                          'Puedo acompañarlos',
                          'Conversando sus necesidades concretas.',
                        ],
                        ['false', 'Hoy no podría ofrecerlos', ''],
                        ['null', 'Quiero conocer qué implican', ''],
                      ])}
                    </>
                  )}
                  {step === 5 && (
                    <>
                      {choices(
                        'preferred_traits',
                        [
                          ['tranquilo', 'Tranquilidad', ''],
                          ['jugueton', 'Juegos compartidos', ''],
                          ['carinoso', 'Mucho afecto', ''],
                          ['independiente', 'Independencia', ''],
                          ['curioso', 'Curiosidad', ''],
                        ],
                        true,
                      )}
                      <div className="form-grid">
                        <label className="form-field">
                          Localidad
                          <input
                            maxLength={80}
                            value={profile.location}
                            onChange={(event) =>
                              set('location', event.target.value)
                            }
                            placeholder="Por ejemplo, Minas"
                          />
                        </label>
                        <label className="form-field">
                          Departamento
                          <input
                            maxLength={80}
                            value={profile.department}
                            onChange={(event) =>
                              set('department', event.target.value)
                            }
                          />
                        </label>
                      </div>
                      <h3>Flexibilidad para encontrar al compañero</h3>
                      {choices('flexibility', [
                        ['1', 'Prefiero mantener mis preferencias', ''],
                        ['3', 'Estoy abierto a conversar', ''],
                        ['5', 'Puedo adaptarme y considerar traslados', ''],
                        ['null', 'Todavía no lo sé', ''],
                      ])}
                    </>
                  )}
                  {step === 6 && (
                    <>
                      <label className="form-field">
                        ¿Qué te gustaría compartir o qué falta confirmar?
                        <textarea
                          maxLength={1500}
                          value={profile.preferences_text}
                          onChange={(event) =>
                            set('preferences_text', event.target.value)
                          }
                          placeholder="Una rutina tranquila, tiempo de compañía, condiciones que todavía debo confirmar…"
                        />
                      </label>
                      <p className="quiz-footnote">
                        No incluyas documentos, datos de salud de personas ni
                        información identificable de niños. Esta evaluación
                        temporal se transmite al servicio para calcular las
                        afinidades y sólo se guarda como perfil si lo elegís.
                      </p>
                      {session?.authenticated ? (
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={save}
                        >
                          {saved
                            ? 'Perfil guardado en tu cuenta'
                            : 'Guardar mi perfil para otra visita'}
                        </button>
                      ) : (
                        <a className="text-link" href={loginHref('/tu-match/')}>
                          Crear una cuenta para guardar mi perfil ↗
                        </a>
                      )}
                    </>
                  )}
                </div>
                <div className="quiz-navigation">
                  <button
                    className="text-link"
                    disabled={step === 0 || busy}
                    onClick={() => goToStep(step - 1)}
                  >
                    <Icon name="left" />
                    Volver
                  </button>
                  <span className="match-navigation-hint">
                    {step === 6
                      ? 'El próximo paso es conocerse.'
                      : 'A tu ritmo, sin respuestas perfectas.'}
                  </span>
                  <button
                    className="btn btn-orange"
                    disabled={!ready || busy}
                    onClick={() =>
                      step === 6 ? void evaluate() : goToStep(step + 1)
                    }
                  >
                    {busy
                      ? 'Buscando afinidades…'
                      : step === 6
                        ? 'Ver mis afinidades'
                        : 'Seguimos'}
                    <Icon name="arrow" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="match-results-actions">
                  <p>
                    <strong>{result.results.length}</strong> historias para
                    descubrir
                  </p>
                  <button
                    className="text-link"
                    onClick={() => {
                      setResult(null);
                      goToStep(0);
                    }}
                  >
                    Modificar mis respuestas <Icon name="filter" />
                  </button>
                </div>
                <MatchResultsView result={result} />
                <p className="quiz-footnote">
                  Los índices describen afinidad con la información disponible;
                  no son probabilidades de adopción exitosa. La decisión final
                  es humana.
                </p>
                <div className="quiz-navigation">
                  <button
                    className="text-link"
                    onClick={() => {
                      setProfile({ ...emptyProfile });
                      setResult(null);
                      goToStep(0);
                      setVisited([0]);
                      setSaved(false);
                    }}
                  >
                    Volver a empezar <Icon name="arrow" />
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={save}
                    disabled={busy}
                  >
                    {saved ? 'Perfil guardado' : 'Guardar mi perfil'}
                  </button>
                </div>
              </>
            )}
          </div>
          <MatchSummary profile={profile} />
        </div>
      </fieldset>
      {processing && (
        <MatchProcessingDialog
          processing={processing}
          onCancel={() => {
            controller.current?.abort();
            setProcessing(null);
            setBusy(false);
          }}
          onRetry={() => void evaluate()}
        />
      )}
      {busy && !processing && (
        <div className="match-busy" role="status">
          <span className="match-busy-orbit">
            <Icon name="paw" />
          </span>
          <div>
            <strong>Un poquito más cerca de encontrarse…</strong>
            <p>
              Estamos preparando tu búsqueda. Esto puede llevar unos segundos.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
