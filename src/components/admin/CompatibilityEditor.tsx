import FormField from '../forms/FormField';

export interface Observation {
  category: string;
  status:
    | 'compatible'
    | 'incompatible'
    | 'conditional'
    | 'unknown'
    | 'not_applicable';
  observation: string;
  responsible?: string;
  confidence?: number | null;
  evaluated_at?: string | null;
  context?: string;
  recommendations?: string;
}
export const categories: Record<string, string> = {
  dogs: 'Otros perros',
  cats: 'Otros gatos',
  other_pets: 'Otras mascotas',
  birds: 'Aves',
  rabbits: 'Conejos',
  small_mammals: 'Pequeños mamíferos',
  young_children: 'Niños menores de 6 años',
  school_children: 'Niños de 6 a 12 años',
  teenagers: 'Adolescentes',
  adults: 'Adultos',
  frequent_visitors: 'Visitas frecuentes',
  busy_home: 'Hogares con mucha actividad',
  quiet_home: 'Hogares tranquilos',
};
export const observationStatuses = {
  unknown: 'No evaluado',
  compatible: 'Compatible según observaciones',
  incompatible: 'Incompatible según observaciones',
  conditional: 'Con condiciones o supervisión',
  not_applicable: 'No aplicable',
};

export default function CompatibilityEditor({
  value,
  onChange,
}: {
  value: Observation[];
  onChange: (value: Observation[]) => void;
}) {
  function update(index: number, patch: Partial<Observation>) {
    onChange(
      value.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
    );
  }
  function add(category: string) {
    if (category && !value.some((item) => item.category === category))
      onChange([...value, { category, status: 'unknown', observation: '' }]);
  }
  return (
    <section
      className="admin-compatibilities"
      aria-labelledby="compatibility-editor-title"
    >
      <h3 id="compatibility-editor-title">Convivencia observada</h3>
      <p>
        Registrá lo que se conoce y el contexto de la observación. Una
        convivencia pendiente de evaluar necesita confirmación.
      </p>
      <FormField label="Añadir una categoría de convivencia">
        <select value="" onChange={(event) => add(event.target.value)}>
          <option value="">Elegí una categoría</option>
          {Object.entries(categories)
            .filter(([key]) => !value.some((item) => item.category === key))
            .map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
        </select>
      </FormField>
      {value.map((item, index) => (
        <div className="admin-compatibility" key={item.category}>
          <div className="management-title-row">
            <h4>{categories[item.category] ?? item.category}</h4>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                onChange(value.filter((_, current) => current !== index))
              }
            >
              Quitar categoría
            </button>
          </div>
          <div className="form-grid">
            <FormField label="Resultado registrado">
              <select
                value={item.status}
                onChange={(event) =>
                  update(index, {
                    status: event.target.value as Observation['status'],
                  })
                }
              >
                {Object.entries(observationStatuses).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Confianza de la observación">
              <select
                value={item.confidence ?? ''}
                onChange={(event) =>
                  update(index, {
                    confidence:
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                  })
                }
              >
                <option value="">Sin precisar</option>
                <option value="0.3">Baja</option>
                <option value="0.6">Media</option>
                <option value="0.9">Alta</option>
              </select>
            </FormField>
            <FormField label="Observación que respalda el resultado" full>
              <textarea
                value={item.observation}
                maxLength={3000}
                required={[
                  'compatible',
                  'incompatible',
                  'conditional',
                ].includes(item.status)}
                onChange={(event) =>
                  update(index, { observation: event.target.value })
                }
              />
            </FormField>
            <FormField label="Nombre visible de quien evaluó">
              <input
                value={item.responsible ?? ''}
                maxLength={120}
                onChange={(event) =>
                  update(index, { responsible: event.target.value })
                }
              />
            </FormField>
            <FormField label="Fecha de evaluación">
              <input
                type="date"
                value={item.evaluated_at?.slice(0, 10) ?? ''}
                onChange={(event) =>
                  update(index, {
                    evaluated_at: event.target.value
                      ? `${event.target.value}T00:00:00Z`
                      : null,
                  })
                }
              />
            </FormField>
            <FormField label="Contexto de la observación" full>
              <textarea
                maxLength={2000}
                value={item.context ?? ''}
                onChange={(event) =>
                  update(index, { context: event.target.value })
                }
              />
            </FormField>
            <FormField label="Recomendaciones para la convivencia" full>
              <textarea
                maxLength={3000}
                value={item.recommendations ?? ''}
                onChange={(event) =>
                  update(index, { recommendations: event.target.value })
                }
              />
            </FormField>
          </div>
        </div>
      ))}
    </section>
  );
}
