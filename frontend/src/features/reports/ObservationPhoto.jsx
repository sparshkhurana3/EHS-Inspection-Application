import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  apiBlobRequest,
} from "../../services/apiClient.js";

/**
 * One observation's photograph as a small thumbnail that opens full
 * size in a dialog (docs/24 D20). It is fetched through the existing
 * authenticated photograph route, only when the row is expanded (this
 * component mounts then), and its object URL is released when it goes
 * away.
 */
export default function ObservationPhoto({
  reportId,
  itemId,
  label,
}) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    apiBlobRequest(
      `/observations/${reportId}/items/${itemId}/photograph`,
      { method: "GET" },
    )
      .then((blob) => {
        if (cancelled) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);

        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [reportId, itemId]);

  if (failed) {
    return (
      <span className="report-muted">
        Photo unavailable
      </span>
    );
  }

  if (!url) {
    return (
      <span className="report-photo-placeholder">
        Loading…
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="report-photo-thumb"
        onClick={() =>
          dialogRef.current?.showModal()
        }
        aria-label={`Open the photograph for ${label}`}
      >
        <img src={url} alt={label} />
      </button>

      <dialog
        ref={dialogRef}
        className="report-photo-dialog"
        onClick={(event) => {
          if (event.target === dialogRef.current) {
            dialogRef.current.close();
          }
        }}
      >
        <img src={url} alt={label} />

        <button
          type="button"
          className="button button-secondary report-small-button"
          onClick={() =>
            dialogRef.current?.close()
          }
        >
          Close
        </button>
      </dialog>
    </>
  );
}
