# kotlinx.serialization keeps generated serializers for @Serializable classes via its bundled rules.
# Media3, OkHttp, Coil and Compose ship consumer rules. Add rules here only for a reproduced shrinker failure.

# Never log request bodies/headers in release builds (credential material).
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
}
