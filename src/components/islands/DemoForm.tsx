import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { api, errorMessage, getSession } from '../../lib/api';
import { useSession } from '../../features/auth/store';
import { useClientState } from '../../features/preferences/useClientState';
import FormField from '../forms/FormField';
import SelectMenu from '../ui/SelectMenu';
import Icon from '../ui/Icon';
export type FormKind = 'adoption' | 'publish' | 'transit' | 'volunteer';
export default function DemoForm({
  kind: initialKind,
  petName,
  petId,
  isDemo = false,
  available = true,
}: {
  kind: FormKind;
  petName?: string;
  petId?: string;
  isDemo?: boolean;
  available?: boolean;
}) {
  const ready = useClientState();
  const session = useSession();
  const [kind, setKind] = useState(initialKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [preview, setPreview] = useState<Record<string, string> | null>(null);
  const [species, setSpecies] = useState('dog');
  const [place, setPlace] = useState('');
  const [organization, setOrganization] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [createdId, setCreatedId] = useState('');
  const [organizations, setOrganizations] = useState<
    { id: string; name: string }[]
  >([]);
  const [organizationsRetry, setOrganizationsRetry] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  const isPublish = kind === 'publish';
  const collaboration = kind === 'transit' || kind === 'volunteer';
  useEffect(() => {
    if (!collaboration)
      void getSession().catch((failure) => setError(errorMessage(failure)));
  }, [collaboration]);
  useEffect(() => {
    if (
      collaboration &&
      new URLSearchParams(location.search).get('tipo') === 'volunteer'
    )
      setKind('volunteer');
  }, []);
  useEffect(() => {
    if (done || preview) title.current?.focus({ preventScroll: true });
  }, [done, preview]);
  useEffect(() => {
    if (!isPublish || !ready || !session?.authenticated) return;
    const controller = new AbortController();
    void api<{ items: { id: string; name: string }[] }>(
      '/admin/organizations?page_size=100',
      {
        signal: controller.signal,
      },
    )
      .then((value) => setOrganizations(value.items ?? []))
      .catch((failure) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      });
    return () => controller.abort();
  }, [ready, isPublish, session?.user?.id, organizationsRetry]);
  async function publish() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      let id = createdId;
      if (!id) {
        const pet = await api<{ id: string }>('/admin/pets', {
          method: 'POST',
          body: {
            name: preview.petname,
            species: preview.species,
            organization_id: preview.organization_id,
            location: preview.place,
            department: preview.department,
            age: preview.age,
            months: Number(preview.months),
            stage: preview.stage,
            size: preview.size,
            sex: preview.sex,
            story: preview.description,
            needs: preview.needs,
            quote: preview.quote,
            energy: Number(preview.energy),
            traits: preview.traits
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
            care: [],
            alt: `Fotografía de ${preview.petname}`,
          },
        });
        id = pet.id;
        setCreatedId(id);
      }
      for (const file of files) {
        const data = new FormData();
        data.append('file', file);
        await api(`/admin/pets/${encodeURIComponent(id)}/photos`, {
          method: 'POST',
          body: data,
        });
        setFiles((current) => current.filter((value) => value !== file));
      }
      setFiles([]);
      await api(`/admin/pets/${encodeURIComponent(id)}/submit`, {
        method: 'POST',
      });
      setDone(true);
      setPreview(null);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(
      [...new FormData(form).entries()].filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    if (isPublish) {
      setPreview(data);
      return;
    }
    if (collaboration) {
      setDone(true);
      form.reset();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/adoptions/applications', {
        method: 'POST',
        body: { pet_id: petId, message: data.message, consent: true },
      });
      setDone(true);
      form.reset();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  if (isDemo || (!available && kind === 'adoption'))
    return (
      <div className="interactive-panel">
        <div className="eyebrow">
          <Icon name="info" />
          Una adopción necesita información real
        </div>
        <h2>
          {isDemo
            ? 'Esta historia es de muestra.'
            : 'Esta mascota no recibe solicitudes.'}
        </h2>
        <p>
          {isDemo
            ? 'Los perfiles ficticios permiten conocer la plataforma. No representan animales disponibles y no aceptan solicitudes reales.'
            : 'Podés explorar otras historias publicadas y consultar sus necesidades.'}
        </p>
        <a className="btn btn-dark" href="/adopcion/">
          Seguir explorando
        </a>
      </div>
    );
  if (!collaboration && !session)
    return (
      <div className="interactive-panel" role={error ? 'alert' : 'status'}>
        {error || 'Conectando con tu cuenta…'}
        {error && (
          <button
            className="btn btn-outline"
            onClick={() => {
              setError('');
              void getSession(true).catch((failure) =>
                setError(errorMessage(failure)),
              );
            }}
          >
            Volver a intentar
          </button>
        )}
      </div>
    );
  if (!collaboration && !session?.authenticated)
    return (
      <div className="interactive-panel">
        <div className="eyebrow">Tu próximo paso</div>
        <h2>
          Un encuentro
          <br />
          empieza por conocernos.
        </h2>
        <p>
          Ingresá o creá una cuenta para{' '}
          {isPublish
            ? 'preparar una ficha con la organización responsable'
            : 'guardar tu solicitud y seguir su estado'}
          .
        </p>
        <a
          className="btn btn-orange"
          href={`/login/?next=${encodeURIComponent(isPublish ? '/publicar/' : `/solicitud/${petId}/`)}`}
        >
          Ingresar o crear una cuenta <Icon name="arrow" />
        </a>
      </div>
    );
  if (isPublish && session?.user?.role === 'adopter')
    return (
      <div className="interactive-panel">
        <h2>Publicaciones acompañadas.</h2>
        <p>
          Las fichas son creadas por responsables de organizaciones y revisadas
          antes de publicarse. Tu cuenta de adoptante puede explorar historias,
          guardar un perfil y enviar solicitudes.
        </p>
        <a className="btn btn-dark" href="/cuenta/">
          Ver mi cuenta
        </a>
      </div>
    );
  if (done)
    return (
      <div className="interactive-panel form-success">
        <div className="success-icon">
          <Icon name="check" />
        </div>
        <div className="eyebrow">
          {collaboration
            ? 'Recorrido de demostración completado'
            : isPublish
              ? 'Ficha enviada a revisión'
              : 'Solicitud recibida'}
        </div>
        <h2 ref={title} tabIndex={-1}>
          Así empieza
          <br />
          una nueva historia.
        </h2>
        <p>
          {collaboration ? (
            <strong>
              No se envió, guardó ni publicó ningún dato. La colaboración
              todavía es un recorrido de demostración.
            </strong>
          ) : isPublish ? (
            'La ficha quedó guardada y pendiente de aprobación. Podés completar observaciones y gestionar las fotografías desde el panel.'
          ) : (
            'Tu solicitud quedó guardada. El equipo responsable revisará la información; podés consultar su estado en tu cuenta.'
          )}
        </p>
        <a
          className="btn btn-dark"
          href={
            isPublish ? '/admin/' : collaboration ? '/adopcion/' : '/cuenta/'
          }
        >
          {isPublish
            ? 'Abrir el panel'
            : collaboration
              ? 'Seguir explorando'
              : 'Ver mis solicitudes'}
          <Icon name="arrow" />
        </a>
      </div>
    );
  if (preview)
    return (
      <div className="interactive-panel">
        <div className="eyebrow">
          <Icon name="paw" />
          Revisá antes de enviar
        </div>
        <h2 ref={title} tabIndex={-1}>
          {preview.petname}
        </h2>
        <dl className="preview-facts">
          <div>
            <dt>Localidad</dt>
            <dd>{preview.place}</dd>
          </div>
          <div>
            <dt>Fotografías</dt>
            <dd>{files.length} seleccionadas</dd>
          </div>
        </dl>
        <p className="preview-story">{preview.description}</p>
        <p>{preview.needs}</p>
        <div className="demo-notice">
          <Icon name="info" />
          <span>
            Se guardará como ficha pendiente de revisión. Sólo una publicación
            aprobada aparece en el catálogo. Las convivencias sin observaciones
            quedan pendientes de evaluar.
          </span>
        </div>
        {error && (
          <p role="alert" className="api-notice">
            {error}
            {createdId && (
              <>
                {' '}
                La ficha ya está guardada.{' '}
                <a href="/admin/">Revisarla en el panel</a>.
              </>
            )}
          </p>
        )}
        <button className="btn btn-orange" disabled={busy} onClick={publish}>
          {busy
            ? 'Guardando ficha y fotografías…'
            : 'Guardar y enviar a revisión'}
          <Icon name="check" />
        </button>
        <button
          className="text-link"
          disabled={busy || !!createdId}
          onClick={() => setPreview(null)}
        >
          Volver a editar
        </button>
      </div>
    );
  return (
    <div className="interactive-panel">
      {collaboration && (
        <div className="demo-notice">
          <Icon name="info" />
          <span>
            Formulario de demostración para colaboración. No envía, guarda ni
            comparte tus datos. Usá información ficticia.
          </span>
        </div>
      )}
      {collaboration && (
        <div
          className="species-tabs help-options"
          role="group"
          aria-label="Forma de colaborar"
        >
          {(['transit', 'volunteer'] as const).map((value) => (
            <button
              key={value}
              className={`species-tab ${kind === value ? 'active' : ''}`}
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
            >
              <Icon name={value === 'transit' ? 'home' : 'people'} />
              {value === 'transit' ? 'Hogar de tránsito' : 'Voluntariado'}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="api-notice">
          {error}
          {isPublish && !organizations.length && (
            <button
              className="text-link"
              type="button"
              onClick={() => {
                setError('');
                setOrganizationsRetry((value) => value + 1);
              }}
            >
              Volver a consultar organizaciones
            </button>
          )}
        </p>
      )}
      <form className="demo-form" onSubmit={submit}>
        <fieldset className="demo-fields" disabled={!ready || busy}>
          <legend className="sr-only">
            {isPublish
              ? 'Datos para preparar la ficha'
              : 'Datos de la solicitud'}
          </legend>
          <div className="form-grid">
            {isPublish ? (
              <>
                <FormField label="Nombre de la mascota">
                  <input
                    name="petname"
                    placeholder="¿Cómo se llama?"
                    required
                    maxLength={80}
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
                    options={[
                      { value: 'dog', label: 'Perro' },
                      { value: 'cat', label: 'Gato' },
                      { value: 'rabbit', label: 'Conejo' },
                      { value: 'bird', label: 'Ave' },
                      { value: 'other', label: 'Otra especie' },
                    ]}
                  />
                </FormField>
                <FormField label="Organización responsable" full>
                  <SelectMenu
                    variant="form"
                    label="Organización responsable"
                    name="organization_id"
                    required
                    value={organization}
                    onChange={setOrganization}
                    options={[
                      { value: '', label: 'Elegí una organización' },
                      ...organizations
                        .filter(
                          (value) =>
                            session?.user?.role === 'admin' ||
                            session?.user?.organization_ids?.includes(value.id),
                        )
                        .map((value) => ({
                          value: value.id,
                          label: value.name,
                        })),
                    ]}
                  />
                </FormField>
                <FormField label="Edad o edad estimada">
                  <input
                    name="age"
                    required
                    maxLength={80}
                    placeholder="Por ejemplo, aproximadamente 2 años"
                  />
                </FormField>
                <FormField label="Edad estimada en meses">
                  <input
                    name="months"
                    type="number"
                    min={0}
                    max={600}
                    required
                  />
                </FormField>
                <FormField label="Etapa de vida">
                  <select name="stage" required defaultValue="">
                    <option value="" disabled>
                      Elegí una etapa
                    </option>
                    <option value="young">Joven</option>
                    <option value="adult">Adulto</option>
                    <option value="senior">Mayor</option>
                  </select>
                </FormField>
                <FormField label="Tamaño">
                  <select name="size" required defaultValue="">
                    <option value="" disabled>
                      Elegí un tamaño
                    </option>
                    {['Pequeño', 'Mediano', 'Grande'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Sexo">
                  <select name="sex" required defaultValue="">
                    <option value="" disabled>
                      Elegí una opción
                    </option>
                    <option>Macho</option>
                    <option>Hembra</option>
                  </select>
                </FormField>
                <FormField label="Energía observada (1 a 5)">
                  <input type="number" name="energy" min={1} max={5} required />
                </FormField>
                <FormField label="Departamento">
                  <input
                    name="department"
                    required
                    defaultValue="Lavalleja"
                    maxLength={80}
                  />
                </FormField>
              </>
            ) : collaboration ? (
              <>
                <FormField label="Tu nombre">
                  <input
                    name="name"
                    required
                    maxLength={80}
                    autoComplete="off"
                  />
                </FormField>
                <FormField label="Correo de contacto">
                  <input
                    name="email"
                    type="email"
                    required
                    maxLength={180}
                    autoComplete="off"
                  />
                </FormField>
              </>
            ) : (
              <p className="full">
                La solicitud se asociará a tu cuenta. Revisá tu perfil de hogar
                en <a href="/cuenta/">Mi cuenta</a> antes de enviarla.
              </p>
            )}
            {(isPublish || collaboration) && (
              <FormField label="Localidad" full>
                {isPublish ? (
                  <input
                    name="place"
                    required
                    maxLength={80}
                    placeholder="Por ejemplo, Minas"
                  />
                ) : (
                  <SelectMenu
                    variant="form"
                    label="Localidad"
                    name="place"
                    required
                    value={place}
                    onChange={setPlace}
                    options={[
                      { value: '', label: 'Elegí una localidad' },
                      ...[
                        'Minas',
                        'Solís de Mataojo',
                        'José Pedro Varela',
                        'Otra localidad',
                      ].map((value) => ({ value, label: value })),
                    ]}
                  />
                )}
              </FormField>
            )}
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
                required
                minLength={10}
                maxLength={4000}
                placeholder={
                  isPublish
                    ? 'Historia y observaciones verificables…'
                    : 'Tu rutina, tus posibilidades y qué te gustaría saber…'
                }
              />
            </FormField>
            {isPublish && (
              <>
                <FormField label="Necesidades y cuidados importantes" full>
                  <textarea name="needs" required maxLength={3000} />
                </FormField>
                <FormField label="Una frase que describa su personalidad" full>
                  <input name="quote" required maxLength={240} />
                </FormField>
                <FormField label="Rasgos observados, separados por comas" full>
                  <input
                    name="traits"
                    maxLength={400}
                    placeholder="Cariñoso, curioso…"
                  />
                </FormField>
                <FormField
                  label="Fotografías (hasta 6)"
                  full
                  hint="Elegí fotos claras del animal. Evitá incluir datos personales o información sensible."
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(event) => {
                      const selected = [...(event.target.files ?? [])];
                      if (
                        selected.length > 6 ||
                        selected.some((file) => file.size > 10 * 1024 * 1024)
                      ) {
                        setError(
                          'Elegí hasta 6 fotografías de un máximo de 10 MB cada una.',
                        );
                        event.target.value = '';
                        setFiles([]);
                        return;
                      }
                      setError('');
                      setFiles(selected);
                    }}
                  />
                </FormField>
              </>
            )}
            <label className="form-checkbox full">
              <input type="checkbox" required name="consent" />
              <span>
                {collaboration
                  ? 'Entiendo que esto es una prueba. No se enviará ni publicará información.'
                  : isPublish
                    ? 'Tengo autorización para publicar estas fotografías y confirmo que la información describe observaciones, no suposiciones.'
                    : 'Acepto que la organización responsable use esta información para revisar mi solicitud. Leí la política de privacidad.'}{' '}
                {!collaboration && <a href="/privacidad/">Ver política</a>}
              </span>
            </label>
          </div>
          <button type="submit" className="btn btn-orange">
            {busy
              ? 'Enviando…'
              : isPublish
                ? 'Revisar mi ficha'
                : collaboration
                  ? 'Probar el siguiente paso'
                  : `Enviar solicitud para conocer a ${petName ?? 'esta mascota'}`}
            <Icon name="arrow-up" className="icon-sm" />
          </button>
        </fieldset>
      </form>
    </div>
  );
}
