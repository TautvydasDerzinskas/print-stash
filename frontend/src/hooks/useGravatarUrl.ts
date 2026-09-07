import { useEffect, useState } from "react";
import { gravatarUrl } from "../utils/gravatar";

export function useGravatarUrl(email: string | undefined, size = 128): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!email) {
      setUrl(undefined);
      return;
    }
    let cancelled = false;
    gravatarUrl(email, size).then(result => {
      if (!cancelled) setUrl(result);
    });
    return () => {
      cancelled = true;
    };
  }, [email, size]);

  return url;
}
