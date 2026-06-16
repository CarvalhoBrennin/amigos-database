/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_EXTERNAL_USD_TO_BRL?: string;
    readonly VITE_REPOSITORY_URL?: string;
    readonly VITE_SITE_URL?: string;
    readonly VITE_YOUTUBE_API_KEY?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
