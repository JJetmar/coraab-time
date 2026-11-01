import { defineConfig } from 'tsup';

export default defineConfig([
    {
        entry: ['src/index.ts', 'src/dayjs.ts'],
        format: ['esm', 'cjs'],
        dts: true,
        clean: true,
        // Lets CommonJS users write require('coraab-time/dayjs') like other Day.js plugins.
        cjsInterop: true,
        splitting: true,
        target: 'es2022',
    },
    {
        // Browser bundle used by the GitHub Pages example in public/.
        entry: { 'coraab-time': 'src/index.ts' },
        format: ['esm'],
        outDir: 'public/lib',
        target: 'es2022',
        minify: true,
    },
]);
