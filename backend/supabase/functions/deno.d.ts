declare module "npm:@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}

declare const Deno: {
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
  exit: (code?: number) => never;
  readDir: (path: string | URL) => AsyncIterable<{ name: string; isFile: boolean }>;
  readFile: (path: string | URL) => Promise<Uint8Array>;
  writeFile: (path: string | URL, data: Uint8Array) => Promise<void>;
  readTextFile: (path: string | URL) => Promise<string>;
  makeTempFile: (options?: { prefix?: string; suffix?: string; dir?: string }) => Promise<string>;
  remove: (path: string | URL, options?: { recursive?: boolean }) => Promise<void>;
  stdin: {
    isTerminal: () => boolean;
  };
  Command: new (
    command: string | URL,
    options?: {
      args?: string[];
      cwd?: string | URL;
      clearEnv?: boolean;
      env?: Record<string, string>;
      stdin?: "piped" | "inherit" | "null";
      stdout?: "piped" | "inherit" | "null";
      stderr?: "piped" | "inherit" | "null";
    }
  ) => {
    output: () => Promise<{
      success: boolean;
      code: number;
      signal?: number | null;
      stdout: Uint8Array;
      stderr: Uint8Array;
    }>;
  };
  env: {
    get: (key: string) => string | undefined;
    set: (key: string, value: string) => void;
  };
  errors: {
    NotFound: new (message?: string) => Error;
  };
};
