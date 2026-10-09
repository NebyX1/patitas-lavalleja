import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { locations } from '../../data/pets';
import FormField from '../forms/FormField';
import Icon from '../ui/Icon';
import SelectMenu, { type SelectOption } from '../ui/SelectMenu';
import { useClientState } from '../../features/preferences/useClientState';
export type FormKind = 'adoption' | 'publish' | 'transit' | 'volunteer';
const speciesOptions: SelectOption<string>[] = [
  { value: '', label: 'Elegí una opción' },
  { value: 'Perro', label: 'Perro' },
  { value: 'Gato', label: 'Gato' },
];
const placeOptions: SelectOption<string>[] = [
  { value: '', label: 'Elegí una localidad' },
  ...locations.map((place) => ({ value: place, label: place })),
  { value: 'Otra localidad', label: 'Otra localidad' },
];
export default function DemoForm({
  kind: initialKind,
  petName,
}: {
  kind: FormKind;
  petName?: string;
}) {
  const ready = useClientState();
  const [kind, setKind] = useState(initialKind);
  const [preview, setPreview] = useState<Record<string, string> | null>(null);
  const [done, setDone] = useState(false);
  const [species, setSpecies] = useState('');
  const [place, setPlace] = useState('');
  const title = useRef<HTMLHeadingElement>(null);
  const isPublish = kind === 'publish';
  useEffect(() => {
    if (initialKind !== 'transit' && initialKind !== 'volunteer') return;
    if (new URLSearchParams(location.search).get('tipo') === 'volunteer')
      setKind('volunteer');
  }, [initialKind]);
  useEffect(() => {
    if (preview || done) title.current?.focus({ preventScroll: true });
  }, [preview, done]);
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (isPublish) {
      const data = new FormData(form);
      setPreview(
        Object.fromEntries(
          [...data.entries()].filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        ),
      );
    } else {
      setDone(true);
    }
    form.reset();
    setSpecies('');
    setPlace('');
  }
  const finish = () => {
    setPreview(null);
    setDone(true);
  };
  if (done)
    return (
      <div className="interactive-panel form-success">
        <div className="success-icon">
          <Icon name="check" />
        </div>
        <div className="eyebrow">Recorrido de demostración completado</div>
        <h2 ref={title} tabIndex={-1}>
          Así empieza
          <br />
          una nueva historia.
        </h2>
        <p>
          Probaste el flujo de{' '}
          {isPublish
            ? 'preparación de una ficha'
            : kind === 'adoption'
              ? 'interés en una adopción'
              : 'colaboración'}
          .<br />
          <strong>No se envió, guardó ni publicó ningún dato.</strong>
        </p>
        <a className="btn btn-dark" href="/adopcion/">
          Seguir explorando <Icon name="arrow" />
        </a>
      </div>
    );
  if (preview)
    return (
      <div className="interactive-panel">
        <div className="eyebrow">
          <Icon name="paw" />
          Vista previa de tu ficha
        </div>
        <h2 ref={title} tabIndex={-1}>
          {preview.petname}
        </h2>
        <dl className="preview-facts">
          <div>
            <dt>Especie</dt>
            <dd>{preview.species}</dd>
          </div>
          <div>
            <dt>Localidad</dt>
            <dd>{preview.place}</dd>
          </div>
        </dl>
        <p className="preview-story">{preview.description}</p>
        <div className="demo-notice">
          <Icon name="info" />
          <span>
            Vista previa local. En un servicio conectado, el equipo responsable
            revisaría la información antes de publicarla.
          </span>
        </div>
        <button className="btn btn-orange" onClick={finish}>
          Completar la prueba <Icon name="check" />
        </button>
        <button className="text-link" onClick={() => setPreview(null)}>
          Empezar otra ficha
        </button>
      </div>
    );
  return (
    <div className="interactive-panel">
      <div className="demo-notice">
        <Icon name="info" />
        <span>
          Formulario de demostración. No envía, guarda ni comparte tus datos.
          Podés usar información ficticia para probarlo.
        </span>
      </div>
      {(kind === 'transit' || kind === 'volunteer') && (
        <div
          className="species-tabs help-options"
          role="group"
          aria-label="Forma de colaborar"
        >
          <button
            className={`species-tab ${kind === 'transit' ? 'active' : ''}`}
            aria-pressed={kind === 'transit'}
            onClick={() => setKind('transit')}
          >
            <Icon name="home" />
            Hogar de tránsito
          </button>
          <button
            className={`species-tab ${kind === 'volunteer' ? 'active' : ''}`}
            aria-pressed={kind === 'volunteer'}
            onClick={() => setKind('volunteer')}
          >
            <Icon name="people" />
            Voluntariado
          </button>
        </div>
      )}
      <form className="demo-form" onSubmit={submit}>
        <fieldset className="demo-fields" disabled={!ready}>
          <legend className="sr-only">Datos para probar el recorrido</legend>
          <div className="form-grid">
            {isPublish ? (
              <>
                <FormField label="Nombre de la mascota">
                  <input
                    name="petname"
                    placeholder="¿Cómo se llama?"
                    required
                    maxLength={40}
                    autoComplete="off"
                  />
                </FormField>
                <FormField label="Especie">
                  <SelectMenu
                    variant="form"
                    label="Especie"
                    name="species"
                    required
                    value={species}
                    onChange={setSpecies}
                    options={speciesOptions}
                  />
                </FormField>
              </>
            ) : (
              <>
                <FormField label="Tu nombre">
                  <input
                    name="name"
                    autoComplete="off"
                    placeholder="Por ejemplo, Alex"
                    required
                    maxLength={80}
                  />
                </FormField>
                <FormField label="Correo de contacto">
                  <input
                    type="email"
                    name="email"
                    autoComplete="off"
                    placeholder="nombre@ejemplo.com"
                    required
                    maxLength={180}
                  />
                </FormField>
              </>
            )}
            <FormField label="Localidad" full>
              <SelectMenu
                variant="form"
                label="Localidad"
                name="place"
                required
                value={place}
                onChange={setPlace}
                options={placeOptions}
              />
            </FormField>
            <FormField
              label={
                isPublish
                  ? 'Su historia y sus necesidades'
                  : kind === 'adoption'
                    ? 'Contanos un poquito de tu hogar'
                    : kind === 'transit'
                      ? '¿Qué espacio y disponibilidad tendrías?'
                      : '¿Cómo te gustaría ayudar?'
              }
              full
            >
              <textarea
                name={isPublish ? 'description' : 'message'}
                placeholder={
                  isPublish
                    ? 'Personalidad, rutinas y todo lo que una familia debería conocer…'
                    : 'Tu rutina, tus posibilidades y qué te gustaría saber…'
                }
                required
                maxLength={1800}
              />
            </FormField>
            {isPublish && (
              <FormField label="Correo del responsable" full>
                <input
                  name="email"
                  type="email"
                  placeholder="nombre@ejemplo.com"
                  autoComplete="off"
                  required
                  maxLength={180}
                />
              </FormField>
            )}
            <label className="form-checkbox full">
              <input type="checkbox" required name="demo" />
              <span>
                Entiendo que esto es una prueba
                {petName ? ` del recorrido para conocer a ${petName}` : ''}. No
                se enviará ni publicará información.
              </span>
            </label>
          </div>
          <button type="submit" className="btn btn-orange">
            {isPublish
              ? 'Revisar la ficha de ejemplo'
              : 'Probar el siguiente paso'}
            <Icon name="arrow-up" className="icon-sm" />
          </button>
        </fieldset>
      </form>
    </div>
  );
}
