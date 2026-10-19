import { useEffect, useRef, useState } from 'react';
import {
  processingStages,
  type SearchProcessing,
} from '../../features/match/processing';
import {
  compatibilityStages,
  type CompatibilityProcessing,
} from '../../features/match/compatibility-processing';
import Icon from '../ui/Icon';
import '../../styles/match-processing.css';

const labels = {
  running: 'En proceso',
  complete: 'Listo',
  unavailable: 'No disponible',
  disabled: 'Desactivado',
  not_used: 'No requerido',
} as const;

export default function MatchProcessingDialog({
  processing,
  onCancel,
  onRetry,
}: {
  processing: SearchProcessing | CompatibilityProcessing;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const alreadyLocked = document.body.classList.contains('locked');
    element.showModal();
    document.body.classList.add('locked');
    title.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      if (!alreadyLocked) document.body.classList.remove('locked');
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    setElapsed(0);
    const timer = setInterval(
      () =>
        setElapsed(
          Math.floor((performance.now() - processing.startedAt) / 1000),
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [processing.startedAt]);
  const personal = processing.kind === 'compatibility';
  const stages = personal ? compatibilityStages : processingStages;
  const active = stages.find(
    (stage) => processing.stages[stage.id]?.state === 'running',
  );
  const finished = stages.filter(
    (stage) =>
      processing.stages[stage.id] &&
      processing.stages[stage.id]?.state !== 'running',
  ).length;
  const structured = processing.stages.structured;
  const done = processing.phase === 'complete';
  const failed = processing.phase === 'error';
  const degraded = processing.result?.meta.degraded;
  const status = failed
    ? personal
      ? 'El análisis necesita otro intento.'
      : 'La búsqueda necesita otro intento.'
    : done
      ? personal
        ? `Tu análisis con ${processing.animalName} está listo. ${degraded ? 'Algunas funciones no estuvieron disponibles.' : 'Ya podemos ver las afinidades y los puntos a conversar.'}`
        : `${processing.result?.results.length ?? 0} historias para explorar. ${degraded ? 'Algunas funciones no estuvieron disponibles.' : 'Tu búsqueda está lista.'}`
      : personal
        ? processing.result
          ? 'Compatibilidad revisada. Preparando una explicación para vos.'
          : `Contrastamos tu hogar con las necesidades de ${processing.animalName}.`
        : active
          ? `${active.name}. ${active.detail}.`
          : finished
            ? 'Confirmamos la disponibilidad de los perfiles.'
            : 'Preparando tu búsqueda de una nueva compañía.';
  return (
    <dialog
      ref={dialog}
      className={`match-processing-dialog${done ? ' is-complete' : ''}${failed ? ' is-error' : ''}`}
      aria-labelledby="match-processing-title"
      aria-describedby="match-processing-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <button
        type="button"
        className="processing-close circle-button"
        aria-label={
          failed
            ? 'Cerrar procesamiento'
            : personal
              ? 'Cancelar análisis'
              : 'Cancelar búsqueda'
        }
        onClick={onCancel}
      >
        <Icon name="close" />
      </button>
      <div className="processing-brand">
        <Icon name="spark" />
        <span>Patitas Intelligence</span>
        <span className="processing-live">
          {failed
            ? 'Interrumpida'
            : personal
              ? done
                ? 'Análisis listo'
                : processing.result
                  ? 'Preparando informe'
                  : 'En análisis'
              : done
                ? 'Búsqueda lista'
                : 'En vivo'}
        </span>
      </div>
      <div className="processing-intro">
        <div>
          <h2 ref={title} tabIndex={-1} id="match-processing-title">
            {failed
              ? 'Nos falta un pasito.'
              : personal
                ? done
                  ? 'Ya tenemos tu análisis.'
                  : `Tu mundo y el de ${processing.animalName}.`
                : done
                  ? 'Sus mundos, más cerca.'
                  : 'Buscando una linda conexión.'}
          </h2>
          <p id="match-processing-description">
            {failed
              ? personal
                ? 'Tu perfil sigue guardado. Podés volver a intentarlo.'
                : 'Tus respuestas siguen acá. Podés volver a intentarlo.'
              : personal
                ? done
                  ? 'Veamos las afinidades y los puntos que necesitan una conversación.'
                  : 'Conectamos tu rutina, sus necesidades y lo que buscás en un compañero.'
                : done
                  ? 'Ya tenemos tus afinidades. Vamos a conocer esas historias.'
                  : 'Tu hogar, sus necesidades y una nueva historia por descubrir.'}
          </p>
        </div>
        <div className="processing-orbit" aria-hidden="true">
          <span className="processing-orbit-ring" />
          <span className="processing-orbit-ring second" />
          <span className="processing-orbit-node node-home">
            <Icon name="home" />
          </span>
          <span className="processing-orbit-node node-heart">
            <Icon name="heart" />
          </span>
          <span className="processing-orbit-core">
            <Icon name={done ? 'check' : failed ? 'info' : 'paw'} />
          </span>
        </div>
      </div>
      <div
        className="processing-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="processing-pulse" />
        {status}
      </div>
      <ol
        className="processing-stages"
        aria-label="Procesamiento de compatibilidad"
      >
        {stages.map((stage) => {
          const state = processing.stages[stage.id]?.state;
          return (
            <li
              key={stage.id}
              data-stage={stage.id}
              data-state={state ?? 'pending'}
              aria-current={state === 'running' ? 'step' : undefined}
            >
              <span className="processing-stage-icon">
                <Icon
                  name={
                    state === 'complete'
                      ? 'check'
                      : state === 'unavailable'
                        ? 'info'
                        : stage.icon
                  }
                />
              </span>
              <div>
                <strong>{stage.name}</strong>
                <span>{stage.detail}</span>
              </div>
              <span className="processing-stage-state">
                {state
                  ? labels[state]
                  : personal
                    ? 'Por confirmar'
                    : 'En espera'}
              </span>
            </li>
          );
        })}
      </ol>
      {failed && (
        <p className="processing-error" role="alert">
          {processing.error}
        </p>
      )}
      <div className="processing-footer">
        <div className="processing-metrics">
          {structured?.profiles !== undefined && (
            <span>
              <strong>{structured.profiles}</strong> perfiles revisados
            </span>
          )}
          {structured?.eligible !== undefined && (
            <span>
              <strong>{structured.eligible}</strong> candidatos compatibles o
              por revisar
            </span>
          )}
          <span>{elapsed} s transcurridos</span>
        </div>
        {failed ? (
          <div className="processing-actions">
            <button className="text-link" onClick={onCancel}>
              {personal ? 'Volver al perfil' : 'Volver a mis respuestas'}
            </button>
            <button className="btn btn-orange" onClick={onRetry}>
              Volver a intentar <Icon name="arrow" />
            </button>
          </div>
        ) : (
          <div className="processing-bottom">
            <span>
              <Icon name="shield" />
              {done
                ? degraded
                  ? 'Orientación disponible con funciones limitadas'
                  : 'Análisis completado'
                : personal
                  ? processing.result
                    ? 'Revisión completada · preparando el informe'
                    : 'Dos miradas: tu hogar y su bienestar'
                  : `${finished} de ${stages.length} etapas resueltas · sin apuros`}
            </span>
            <button className="text-link" onClick={onCancel}>
              {done
                ? personal
                  ? 'Volver al perfil'
                  : 'Volver al cuestionario'
                : 'Cancelar'}
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
