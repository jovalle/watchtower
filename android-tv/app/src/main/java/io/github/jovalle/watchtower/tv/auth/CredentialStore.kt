package io.github.jovalle.watchtower.tv.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.serialization.Serializable
import io.github.jovalle.watchtower.tv.api.MeResponse
import io.github.jovalle.watchtower.tv.api.WatchtowerJson

@Serializable
data class StoredCredential(
    val baseUrl: String,
    val accessToken: String,
    val deviceSessionId: String,
    val identityVersion: Long,
    val expiresAtMs: Long,
    val me: MeResponse?,
)

/**
 * Keeps the device session token in app-private no-backup storage, encrypted with an AES-GCM key
 * held by Android Keystore (hardware-backed only where the device provides it). Any decryption or
 * key failure is treated as signed out and removes the file.
 */
class CredentialStore(context: Context) {
    private val file = File(context.noBackupFilesDir, "device-credential.v1")

    @Synchronized
    fun read(): StoredCredential? {
        if (!file.exists()) return null
        return runCatching {
            val bytes = file.readBytes()
            require(bytes.size > 2 && bytes[0] == FORMAT_VERSION)
            val ivLength = bytes[1].toInt()
            val iv = bytes.copyOfRange(2, 2 + ivLength)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(create = false) ?: error("missing key"), GCMParameterSpec(128, iv))
            cipher.updateAAD(AAD)
            val plain = cipher.doFinal(bytes, 2 + ivLength, bytes.size - 2 - ivLength)
            WatchtowerJson.decodeFromString<StoredCredential>(plain.decodeToString())
        }.getOrElse {
            clear()
            null
        }
    }

    @Synchronized
    fun write(credential: StoredCredential) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key(create = true))
        cipher.updateAAD(AAD)
        val encrypted = cipher.doFinal(WatchtowerJson.encodeToString(credential).encodeToByteArray())
        val iv = cipher.iv
        val tmp = File(file.parentFile, "${file.name}.tmp")
        tmp.writeBytes(byteArrayOf(FORMAT_VERSION, iv.size.toByte()) + iv + encrypted)
        if (!tmp.renameTo(file)) {
            tmp.delete()
            error("Could not save the device credential.")
        }
    }

    @Synchronized
    fun clear() {
        file.delete()
        runCatching { keyStore().deleteEntry(KEY_ALIAS) }
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    private fun key(create: Boolean): SecretKey? {
        (keyStore().getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        if (!create) return null
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "watchtower_device_credential_v1"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val FORMAT_VERSION: Byte = 1
        val AAD = "watchtower-tv-credential-v1".encodeToByteArray()
    }
}
