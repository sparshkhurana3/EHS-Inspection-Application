import {
  useEffect,
  useState,
} from "react";

import { fetchAuthProviders } from "./auth.service.js";

/**
 * Which ways in this deployment offers: the Entra button, and whether
 * self sign-up is open. `providers` stays null until the answer
 * arrives, so neither the button nor a "Sign up" link flashes up on a
 * deployment that does not offer it.
 *
 * A failed lookup is silent: the password form is the failsafe and
 * must stay usable, so a failure only means the optional extras are
 * not offered.
 */
export default function useAuthProviders() {
  const [providers, setProviders] =
    useState(null);

  useEffect(() => {
    let isCurrent = true;

    fetchAuthProviders()
      .then((result) => {
        if (isCurrent) {
          setProviders(
            result?.providers ?? null,
          );
        }
      })
      .catch(() => {
        if (isCurrent) {
          setProviders(null);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  return {
    providers,

    isLoaded: providers !== null,

    entraProvider:
      providers?.entra ?? null,

    signupEnabled:
      providers?.local?.signupEnabled ===
      true,
  };
}
