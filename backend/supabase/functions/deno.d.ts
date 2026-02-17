declare module "npm:@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}

declare const Deno: {
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
  exit: (code?: number) => never;
  readDir: (path: string | URL) => AsyncIterable<{ name: string; isFile: boolean }>;
  readFile: (path: string | URL) => Promise<Uint8Array>;
  readTextFile: (path: string | URL) => Promise<string>;
  env: {
    get: (key: string) => string | undefined;
  };
};
