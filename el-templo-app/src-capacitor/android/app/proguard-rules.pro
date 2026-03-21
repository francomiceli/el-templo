# Capacitor WebView bridge -- keep JavaScript interface classes
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep source file names and line numbers for Sentry stack traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Note: Capacitor's @capacitor/android ships its own consumer ProGuard rules
# that keep plugin classes, annotations, and PluginMethod-annotated methods.
# No need to duplicate those here.
