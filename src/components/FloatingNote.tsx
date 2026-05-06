import { useCallback, useRef, useState } from 'react';
import { useGanttStore } from '../store/useGanttStore';
import type { FloatingNote as FloatingNoteType } from '../types/gantt';
import { FLOATING_NOTE_COLORS } from '../types/gantt';
import RichTextEditor from './RichTextEditor';

interface Props {
  note: FloatingNoteType;
}

type DragMode = 'move' | 'resize' | null;

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  startNoteX: number;
  startNoteY: number;
  startW: number;
  startH: number;
}

export default function FloatingNote({ note }: Props) {
  const moveFloatingNote = useGanttStore(s => s.moveFloatingNote);
  const resizeFloatingNote = useGanttStore(s => s.resizeFloatingNote);
  const removeFloatingNote = useGanttStore(s => s.removeFloatingNote);
  const updateFloatingNote = useGanttStore(s => s.updateFloatingNote);
  const beginFloatingNoteDrag = useGanttStore(s => s.beginFloatingNoteDrag);
  const saveToStorage = useGanttStore(s => s.saveToStorage);

  const [showColors, setShowColors] = useState(false);
  const [editing, setEditing] = useState(false);
  const dragRef = useRef<DragState | null>(null);

  const handlePointerDown = useCallback(
    (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      beginFloatingNoteDrag();
      dragRef.current = {
        mode,
        startX: e.clientX,
        startY: e.clientY,
        startNoteX: note.x,
        startNoteY: note.y,
        startW: note.width,
        startH: note.height,
      };
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [beginFloatingNoteDrag, note]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (d.mode === 'move') {
        moveFloatingNote(note.id, d.startNoteX + dx, d.startNoteY + dy);
      } else if (d.mode === 'resize') {
        resizeFloatingNote(note.id, d.startW + dx, d.startH + dy);
      }
    },
    [moveFloatingNote, resizeFloatingNote, note.id]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      // Single saveToStorage at gesture end (move/resize bypass it per-frame).
      saveToStorage();
    },
    [saveToStorage]
  );

  return (
    <div
      className="floating-note"
      style={{
        left: note.x,
        top: note.y,
        width: note.width,
        height: note.height,
        background: note.color,
      }}
      onDoubleClick={() => setEditing(true)}
    >
      <div
        className="floating-note-header"
        onPointerDown={handlePointerDown('move')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <button
          className="floating-note-color-btn"
          title="Change color"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            setShowColors(s => !s);
          }}
          style={{ background: note.color }}
        />
        {showColors && (
          <div className="floating-note-color-picker" onPointerDown={e => e.stopPropagation()}>
            {FLOATING_NOTE_COLORS.map(c => (
              <button
                key={c}
                className="floating-note-color-swatch"
                style={{ background: c }}
                onClick={e => {
                  e.stopPropagation();
                  updateFloatingNote(note.id, { color: c });
                  setShowColors(false);
                }}
                title={c}
              />
            ))}
          </div>
        )}
        <span className="floating-note-handle-grip" aria-hidden>
          {'∷ ∷'}
        </span>
        <button
          className="floating-note-close-btn"
          title="Delete note"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            removeFloatingNote(note.id);
          }}
        >
          {'×'}
        </button>
      </div>

      <div
        className="floating-note-body"
        onPointerDown={e => {
          // Body click: don't pan or drag-create. Lets RichTextEditor focus.
          e.stopPropagation();
          if (!editing) setEditing(true);
        }}
      >
        {editing ? (
          <RichTextEditor
            value={note.text}
            onSave={html => {
              updateFloatingNote(note.id, { text: html });
              setEditing(false);
            }}
            className="floating-note-editor"
          />
        ) : note.text && /\S/.test(note.text.replace(/<[^>]+>/g, '')) ? (
          <div
            className="floating-note-content"
            // Sanitization happens on save in RichTextEditor; the stored
            // value is already clean. No active editing in this branch.
            dangerouslySetInnerHTML={{ __html: note.text }}
          />
        ) : (
          <div className="floating-note-placeholder">Double-click to edit</div>
        )}
      </div>

      <div
        className="floating-note-resize"
        title="Resize"
        onPointerDown={handlePointerDown('resize')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}
