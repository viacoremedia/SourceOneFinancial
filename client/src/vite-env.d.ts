/// <reference types="vite/client" />

// CSS module type declarations for TypeScript
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
