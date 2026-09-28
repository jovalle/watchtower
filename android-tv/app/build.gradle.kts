plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Release signing is configured only from the environment; nothing secret lives in the repository.
val releaseKeystore = providers.environmentVariable("WATCHTOWER_TV_KEYSTORE").orNull
val configuredVersionCode = providers.gradleProperty("watchtower.tv.versionCode")
    .orElse(providers.environmentVariable("WATCHTOWER_TV_VERSION_CODE"))
    .orNull
val tvVersionCode = configuredVersionCode?.let { value ->
    value.toIntOrNull()?.takeIf { it in 1..2_100_000_000 }
        ?: throw GradleException(
            "watchtower.tv.versionCode/WATCHTOWER_TV_VERSION_CODE must be a positive integer no greater than 2100000000 (received '$value').",
        )
} ?: 1
val tvVersionName = providers.gradleProperty("watchtower.tv.versionName")
    .orElse(providers.environmentVariable("WATCHTOWER_TV_VERSION_NAME"))
    .getOrElse("0.1.0")

android {
    namespace = "io.github.jovalle.watchtower.tv"
    // Current AndroidX/Coil releases require compiling against API 37; runtime behavior follows targetSdk.
    compileSdk = 37

    defaultConfig {
        // Provisional application ID: confirm ownership before the first Play upload (it cannot change afterwards).
        applicationId = "io.github.jovalle.watchtower.tv"
        minSdk = 28
        targetSdk = 36
        versionCode = tvVersionCode
        versionName = tvVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Harness-only credential hook; scripts/tv-e2e/room-e2e.ts invokes it directly with `am instrument -e class`.
        testInstrumentationRunnerArguments["notClass"] = "io.github.jovalle.watchtower.tv.e2e.SeedCredentialTest"
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = providers.environmentVariable("WATCHTOWER_TV_KEYSTORE_PASSWORD").get()
                keyAlias = providers.environmentVariable("WATCHTOWER_TV_KEY_ALIAS").get()
                keyPassword = providers.environmentVariable("WATCHTOWER_TV_KEY_PASSWORD").get()
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            buildConfigField("boolean", "ALLOW_CLEARTEXT", "true")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("boolean", "ALLOW_CLEARTEXT", "false")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
    }
}

tasks.withType<Test>().configureEach {
    systemProperty("watchtower.contracts", rootProject.projectDir.resolve("../contracts").absolutePath)
    // Watch Together owns these fixtures; present only on branches that include its room API.
    systemProperty("watchtower.roomFixtures", rootProject.projectDir.resolve("../test/fixtures/rooms/v1/fixtures.json").absolutePath)
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.tv.material)
    implementation(libs.androidx.tvprovider)
    implementation(libs.androidx.profileinstaller)
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.exoplayer.hls)
    implementation(libs.media3.datasource.okhttp)
    implementation(libs.media3.session)
    implementation(libs.media3.ui)
    implementation(libs.media3.ui.compose)
    implementation(libs.okhttp)
    implementation(libs.okhttp.sse)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.zxing.core)

    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)

    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.kotlinx.coroutines.test)
    androidTestImplementation(libs.okhttp.mockwebserver)
}
