import PhotographInput from "./PhotographInput.jsx";
import RiskSelector from "./RiskSelector.jsx";

import { countWords } from "./useObservations.js";

/**
 * The repeated part of the report form: one observation's area,
 * category, photograph, description and risk. Ids are suffixed with
 * the index so labels stay unique when several are on the page.
 */
export default function ObservationItemFields({
  index,
  total,
  item,
  areas,
  disabled,
  maxDescriptionWords,
  onFieldChange,
  onPhotographChange,
  onPhotographRemove,
  onRemove,
}) {
  const suffix = `-${index}`;
  const wordCount = countWords(item.description);

  return (
    <fieldset
      className="observation-item-fieldset"
      disabled={disabled}
    >
      <div className="observation-item-heading">
        <legend>
          Observation {index + 1} of {total}
        </legend>

        {total > 1 ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onRemove(index)}
            disabled={disabled}
          >
            Remove
          </button>
        ) : null}
      </div>

      <div className="form-field">
        <label htmlFor={`zoneAreaId${suffix}`}>
          Area of observation
          <span
            className="required-marker"
            aria-hidden="true"
          >
            {" *"}
          </span>
        </label>

        <select
          id={`zoneAreaId${suffix}`}
          required
          aria-required="true"
          value={item.zoneAreaId}
          onChange={(event) =>
            onFieldChange(
              index,
              "zoneAreaId",
              event.target.value,
            )
          }
        >
          <option value="">
            Select the area
          </option>

          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor={`category${suffix}`}>
          Category
          <span
            className="required-marker"
            aria-hidden="true"
          >
            {" *"}
          </span>
        </label>

        <select
          id={`category${suffix}`}
          required
          aria-required="true"
          value={item.category}
          onChange={(event) =>
            onFieldChange(
              index,
              "category",
              event.target.value,
            )
          }
        >
          <option value="">
            Select the category
          </option>
          <option value="UC">
            UC - Unsafe Condition
          </option>
          <option value="UA">
            UA - Unsafe Act
          </option>
        </select>
      </div>

      <PhotographInput
        inputId={`observation-photograph${suffix}`}
        photograph={item.photograph}
        photographPreview={item.photographPreview}
        disabled={disabled}
        onChange={(file) =>
          onPhotographChange(index, file)
        }
        onRemove={() => onPhotographRemove(index)}
      />

      <div className="form-field">
        <label htmlFor={`description${suffix}`}>
          Observation description
          <span
            className="required-marker"
            aria-hidden="true"
          >
            {" *"}
          </span>
        </label>

        <textarea
          id={`description${suffix}`}
          rows="6"
          required
          aria-required="true"
          aria-describedby={`description-count${suffix}`}
          value={item.description}
          onChange={(event) =>
            onFieldChange(
              index,
              "description",
              event.target.value,
            )
          }
        />

        <span id={`description-count${suffix}`}>
          {wordCount}/{maxDescriptionWords} words
        </span>
      </div>

      <RiskSelector
        value={item.riskCategory}
        disabled={disabled}
        onChange={(value) =>
          onFieldChange(index, "riskCategory", value)
        }
      />
    </fieldset>
  );
}
