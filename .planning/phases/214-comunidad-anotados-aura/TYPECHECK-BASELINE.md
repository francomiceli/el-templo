# TYPECHECK-BASELINE (fase 214, plan 01) - 2026-11-17

Linea de base ANTES de tocar codigo. Los planes siguientes comparan contra esto: cero errores NUEVOS.

## API: 0 errores
- Comando: cd el-templo-api && pnpm exec tsc --noEmit
- Proveedor node_modules: /home/franco/projects/et-199-mi-templo/el-templo-api/node_modules (lock md5 5762f05d4c)
- Salida: vacia, exit 0

## App: 21 errores
- Comando: cd el-templo-app && /home/franco/projects/el-templo/el-templo-web/node_modules/.bin/vue-tsc --noEmit -p tsconfig.json
- Proveedor node_modules: /home/franco/projects/et-202-carga/el-templo-app/node_modules (lock md5 063bf7a8e6)
- Causa: import.meta.env sin tipos de vite/client (vue-tsc corre desde el-templo-web) y modulos faltantes (html5-qrcode, vitest). Vienen del entorno, no del codigo.

```
src/boot/__tests__/axios-refresh-lock.test.ts(110,5): error TS2322: Type '(url: string) => Promise<{ data: unknown; }>' is not assignable to type '(<T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D | undefined, config?: AxiosRequestConfig<D> | undefined) => Promise<R>) & ((url: string, body?: unknown) => Promise<...>)'.
  Type '(url: string) => Promise<{ data: unknown; }>' is not assignable to type '<T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D | undefined, config?: AxiosRequestConfig<D> | undefined) => Promise<R>'.
    Type 'Promise<{ data: unknown; }>' is not assignable to type 'Promise<R>'.
      Type '{ data: unknown; }' is not assignable to type 'R'.
        'R' could be instantiated with an arbitrary type which could be unrelated to '{ data: unknown; }'.
src/boot/__tests__/axios-refresh-lock.test.ts(117,18): error TS2322: Type '() => void' is not assignable to type 'AxiosRequestInterceptorUse<InternalAxiosRequestConfig<any>> & (() => void)'.
  Type '() => void' is not assignable to type 'AxiosRequestInterceptorUse<InternalAxiosRequestConfig<any>>'.
    Type 'void' is not assignable to type 'number'.
src/boot/__tests__/axios-refresh-lock.test.ts(118,19): error TS2322: Type '() => void' is not assignable to type 'AxiosResponseInterceptorUse<AxiosResponse<any, any, {}>> & (() => void)'.
  Type '() => void' is not assignable to type 'AxiosResponseInterceptorUse<AxiosResponse<any, any, {}>>'.
    Type 'void' is not assignable to type 'number'.
src/boot/axios.ts(27,29): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/boot/axios.ts(181,17): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/boot/axios.ts(183,17): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/boot/axios.ts(184,17): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/boot/sentry.ts(55,27): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/boot/sentry.ts(61,30): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/boot/sentry.ts(61,70): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/boot/sentry.ts(67,35): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/boot/staging-marker.ts(13,19): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/config/featureFlags.ts(40,50): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/layouts/MainLayout.vue(438,41): error TS2339: Property 'displayName' does not exist on type '{ id: number; email: string; firstName: string | null; lastName: string | null; role: "member" | "coach" | "admin" | "superadmin"; level: "kairos" | "alfa" | "delta" | "sigma" | "omega" | "spartan"; ... 17 more ...; branchLocality?: string | ... 1 more ... | undefined; }'.
src/modules/onboarding/components/OnboardingQuestion.vue(4,25): error TS2339: Property 'frame' does not exist on type 'QuizQuestion | QuizQuestionV2'.
  Property 'frame' does not exist on type 'QuizQuestion'.
src/modules/onboarding/components/OnboardingQuestion.vue(4,67): error TS2339: Property 'frame' does not exist on type 'QuizQuestion | QuizQuestionV2'.
  Property 'frame' does not exist on type 'QuizQuestion'.
src/pages/ChangePasswordPage.vue(5,67): error TS2339: Property '$router' does not exist on type '{ onChangePassword: () => Promise<void>; currentPassword: string; newPassword: string; confirmPassword: string; changingPassword: boolean; $: ComponentInternalInstance; ... 15 more ...; $api: AxiosInstance; }'.
src/pages/IndexPage.vue(78,33): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/router/index.ts(1,30): error TS2307: Cannot find module '#q-app/wrappers' or its corresponding type declarations.
src/router/routes.ts(139,29): error TS7016: Could not find a declaration file for module 'pages/ErrorNotFound.vue'. '/home/franco/projects/et-comunidad/el-templo-app/src/pages/ErrorNotFound.vue' implicitly has an 'any' type.
src/utils/logger.ts(29,30): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
```

## Admin: 36 errores
- Comando: cd el-templo-admin && /home/franco/projects/el-templo/el-templo-web/node_modules/.bin/vue-tsc --noEmit -p tsconfig.json
- Proveedor node_modules: /home/franco/projects/el-templo/el-templo-admin/node_modules (lock md5 8cd26e21a3)
- Probado tambien et-199-mi-templo/el-templo-admin: 35 errores (diferencia irrelevante). Ningun worktree con ese md5 tiene vitest instalado.

```
src/boot/__tests__/axios-refresh-lock.test.ts(1,54): error TS2307: Cannot find module 'vitest' or its corresponding type declarations.
src/boot/__tests__/axios-refresh-lock.test.ts(80,5): error TS2322: Type '(url: string) => Promise<{ data: { accessToken: string; refreshToken: string; }; } | { data: { accessToken?: undefined; refreshToken?: undefined; }; }>' is not assignable to type '(<T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D | undefined, config?: AxiosRequestConfig<D> | undefined) => Promise<R>) & ((url: string, body?: unknown) => Promise<...>)'.
  Type '(url: string) => Promise<{ data: { accessToken: string; refreshToken: string; }; } | { data: { accessToken?: undefined; refreshToken?: undefined; }; }>' is not assignable to type '<T = any, R = AxiosResponse<T, any, {}>, D = any>(url: string, data?: D | undefined, config?: AxiosRequestConfig<D> | undefined) => Promise<R>'.
    Type 'Promise<{ data: { accessToken: string; refreshToken: string; }; } | { data: { accessToken?: undefined; refreshToken?: undefined; }; }>' is not assignable to type 'Promise<R>'.
      Type '{ data: { accessToken: string; refreshToken: string; }; } | { data: { accessToken?: undefined; refreshToken?: undefined; }; }' is not assignable to type 'R'.
        'R' could be instantiated with an arbitrary type which could be unrelated to '{ data: { accessToken: string; refreshToken: string; }; } | { data: { accessToken?: undefined; refreshToken?: undefined; }; }'.
src/boot/__tests__/axios-refresh-lock.test.ts(103,18): error TS2322: Type '() => void' is not assignable to type 'AxiosRequestInterceptorUse<InternalAxiosRequestConfig<any>> & (() => void)'.
  Type '() => void' is not assignable to type 'AxiosRequestInterceptorUse<InternalAxiosRequestConfig<any>>'.
    Type 'void' is not assignable to type 'number'.
src/boot/__tests__/axios-refresh-lock.test.ts(104,19): error TS2322: Type '() => void' is not assignable to type 'AxiosResponseInterceptorUse<AxiosResponse<any, any, {}>> & (() => void)'.
  Type '() => void' is not assignable to type 'AxiosResponseInterceptorUse<AxiosResponse<any, any, {}>>'.
    Type 'void' is not assignable to type 'number'.
src/boot/__tests__/axios-refresh-lock.test.ts(245,74): error TS7006: Parameter '_label' implicitly has an 'any' type.
src/boot/__tests__/axios-refresh-lock.test.ts(245,82): error TS7006: Parameter 'outcome' implicitly has an 'any' type.
src/boot/__tests__/axios-refresh-lock.test.ts(263,77): error TS7006: Parameter 'status' implicitly has an 'any' type.
src/components/ProgramWizardDialog.vue(645,13): error TS2352: Conversion of type 'ProgramDetail' to type 'Record<string, unknown>' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Index signature for type 'string' is missing in type 'ProgramDetail'.
src/components/QrScannerDialog.vue(43,29): error TS2307: Cannot find module 'html5-qrcode' or its corresponding type declarations.
src/components/caja/BandejaPendientesTab.vue(38,17): error TS2339: Property 'onExportBandeja' does not exist on type '{ vencidoCount: number; thresholdDays: number; statusFilter: "pendientes" | "observados" | "todos"; statusOptions: { label: string; value: string; }[]; onFilterChange: () => void; exporting: boolean; ... 68 more ...; vTouchSwipe: TouchSwipe; }'.
src/components/deudas/PorSocioTab.vue(98,60): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'LogData | undefined'.
src/components/feedback/ClassRatingsPanel.vue(56,41): error TS2322: Type '{ responsive: boolean; maintainAspectRatio: boolean; plugins: { legend: { display: boolean; }; tooltip: { callbacks: { label: (ctx: { parsed: { y: number; }; }) => string; }; }; }; scales: { y: { beginAtZero: boolean; min: number; max: number; ticks: { ...; }; }; }; }' is not assignable to type '_DeepPartialObject<CoreChartOptions<"line"> & ElementChartOptions<"line"> & PluginChartOptions<"line"> & DatasetChartOptions<"line"> & ScaleChartOptions<...> & LineControllerChartOptions>'.
  The types of 'plugins.tooltip.callbacks.label' are incompatible between these types.
    Type '(ctx: { parsed: { y: number; }; }) => string' is not assignable to type '(this: TooltipModel<"line">, tooltipItem: TooltipItem<"line">) => string | void | string[]'.
      Types of parameters 'ctx' and 'tooltipItem' are incompatible.
        Type 'TooltipItem<"line">' is not assignable to type '{ parsed: { y: number; }; }'.
          The types of 'parsed.y' are incompatible between these types.
            Type 'number | null' is not assignable to type 'number'.
              Type 'null' is not assignable to type 'number'.
src/components/scheduling/SesionesDePruebaDialog.vue(274,39): error TS2345: Argument of type 'unknown' is not assignable to parameter of type 'LogData | undefined'.
src/components/sessions/EditableBlockCard.vue(729,8): error TS2769: No overload matches this call.
  The last overload gave the following error.
    Argument of type '"swap-exercise"' is not assignable to parameter of type '"update-mobility-prescription"'.
src/components/treemap/ExerciseFlowNode.vue(61,10): error TS2367: This comparison appears to be unintentional because the types '1 | 4 | 7 | 9 | 11' and '3 | 6 | 8 | 10 | 12' have no overlap.
src/components/treemap/VariantFlowNode.vue(38,10): error TS2367: This comparison appears to be unintentional because the types '1 | 4 | 7 | 9 | 11' and '3 | 6 | 8 | 10 | 12' have no overlap.
src/pages/AnatomiaPage.vue(84,14): error TS2322: Type 'string | null' is not assignable to type 'PropertyKey | undefined'.
  Type 'null' is not assignable to type 'PropertyKey | undefined'.
src/pages/AnatomiaPage.vue(110,10): error TS2322: Type 'string | null' is not assignable to type 'PropertyKey | undefined'.
  Type 'null' is not assignable to type 'PropertyKey | undefined'.
src/pages/HorariosPage.vue(1102,7): error TS2322: Type 'number' is not assignable to type 'DayOfWeek'.
src/pages/SessionEditPage.vue(67,10): error TS2322: Type '(payload: { sessionId: number; blockId: number; exercise: SessionExercise; blockRoute: string; blockPattern: string; blockRole: string; }) => void' is not assignable to type '(payload: { sessionId: number; blockId: number; exercise: SessionExercise; blockRoute: string; blockPattern: string; }) => void'.
  Types of parameters 'payload' and 'payload' are incompatible.
    Property 'blockRole' is missing in type '{ sessionId: number; blockId: number; exercise: SessionExercise; blockRoute: string; blockPattern: string; }' but required in type '{ sessionId: number; blockId: number; exercise: SessionExercise; blockRoute: string; blockPattern: string; blockRole: string; }'.
src/stores/__tests__/useAuthStore.test.ts(1,54): error TS2307: Cannot find module 'vitest' or its corresponding type declarations.
src/stores/__tests__/useAuthStore.test.ts(70,72): error TS7006: Parameter '_label' implicitly has an 'any' type.
src/stores/__tests__/useAuthStore.test.ts(70,80): error TS7006: Parameter 'err' implicitly has an 'any' type.
src/stores/__tests__/useAuthStore.test.ts(90,73): error TS7006: Parameter 'status' implicitly has an 'any' type.
src/utils/__tests__/exercise-search-rank.test.ts(1,38): error TS2307: Cannot find module 'vitest' or its corresponding type declarations.
src/utils/__tests__/extract-error.test.ts(1,38): error TS2307: Cannot find module 'vitest' or its corresponding type declarations.
src/utils/__tests__/novedades-push.test.ts(1,38): error TS2307: Cannot find module 'vitest' or its corresponding type declarations.
src/utils/__tests__/novedades-scope.test.ts(1,38): error TS2307: Cannot find module 'vitest' or its corresponding type declarations.
src/utils/__tests__/recategorizacion-historico.test.ts(1,38): error TS2307: Cannot find module 'vitest' or its corresponding type declarations.
src/utils/__tests__/relative-time.test.ts(1,38): error TS2307: Cannot find module 'vitest' or its corresponding type declarations.
src/utils/__tests__/sede-cobro-jornada.test.ts(1,38): error TS2307: Cannot find module 'vitest' or its corresponding type declarations.
src/utils/__tests__/trial-booking-changes.test.ts(1,38): error TS2307: Cannot find module 'vitest' or its corresponding type declarations.
src/utils/__tests__/wellhub-label.test.ts(1,38): error TS2307: Cannot find module 'vitest' or its corresponding type declarations.
src/utils/pdf/session-pdf-builder.ts(224,11): error TS2339: Property 'vfs' does not exist on type 'typeof import("/home/franco/projects/el-templo/el-templo-admin/node_modules/.pnpm/@types+pdfmake@0.3.1/node_modules/@types/pdfmake/build/pdfmake")'.
src/utils/pdf/session-pdf-builder.ts(623,7): error TS2322: Type '{ stack: { columns: ({ text: string; fontSize: number; bold: boolean; color: string; width: string; font: string; alignment?: undefined; } | { text: string; fontSize: number; color: string; width: string; alignment: "right"; bold: boolean; font: string; })[]; margin: number[]; }[]; margin: [...]; }' is not assignable to type 'Content'.
  Types of property 'stack' are incompatible.
    Type '{ columns: ({ text: string; fontSize: number; bold: boolean; color: string; width: string; font: string; alignment?: undefined; } | { text: string; fontSize: number; color: string; width: string; alignment: "right"; bold: boolean; font: string; })[]; margin: number[]; }[]' is not assignable to type 'Content[]'.
      Type '{ columns: ({ text: string; fontSize: number; bold: boolean; color: string; width: string; font: string; alignment?: undefined; } | { text: string; fontSize: number; color: string; width: string; alignment: "right"; bold: boolean; font: string; })[]; margin: number[]; }' is not assignable to type 'Content'.
        Type '{ columns: ({ text: string; fontSize: number; bold: boolean; color: string; width: string; font: string; alignment?: undefined; } | { text: string; fontSize: number; color: string; width: string; alignment: "right"; bold: boolean; font: string; })[]; margin: number[]; }' is not assignable to type 'Content[] | ContentColumns'.
          Type '{ columns: ({ text: string; fontSize: number; bold: boolean; color: string; width: string; font: string; alignment?: undefined; } | { text: string; fontSize: number; color: string; width: string; alignment: "right"; bold: boolean; font: string; })[]; margin: number[]; }' is not assignable to type 'ContentColumns'.
            Types of property 'margin' are incompatible.
              Type 'number[]' is not assignable to type 'Margins | undefined'.
                Type 'number[]' is not assignable to type '[number, number] | [number, number, number, number]'.
                  Type 'number[]' is not assignable to type '[number, number, number, number]'.
                    Target requires 4 element(s) but source may have fewer.
src/utils/pdf/session-pdf-builder.ts(818,7): error TS2322: Type '{ columns: ({ text: string; fontSize: number; bold: boolean; color: string; width: string; font: string; alignment?: undefined; } | { text: string; fontSize: number; color: string; width: string; alignment: "right"; bold: boolean; font: string; })[]; margin: number[]; }' is not assignable to type 'Content'.
  Type '{ columns: ({ text: string; fontSize: number; bold: boolean; color: string; width: string; font: string; alignment?: undefined; } | { text: string; fontSize: number; color: string; width: string; alignment: "right"; bold: boolean; font: string; })[]; margin: number[]; }' is not assignable to type 'Content[] | ContentColumns'.
    Type '{ columns: ({ text: string; fontSize: number; bold: boolean; color: string; width: string; font: string; alignment?: undefined; } | { text: string; fontSize: number; color: string; width: string; alignment: "right"; bold: boolean; font: string; })[]; margin: number[]; }' is not assignable to type 'ContentColumns'.
      Types of property 'margin' are incompatible.
        Type 'number[]' is not assignable to type 'Margins | undefined'.
          Type 'number[]' is not assignable to type '[number, number] | [number, number, number, number]'.
            Type 'number[]' is not assignable to type '[number, number, number, number]'.
              Target requires 4 element(s) but source may have fewer.
```
