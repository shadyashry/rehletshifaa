package com.rehletshifaa.document.infrastructure;

import com.rehletshifaa.shared.api.ApiException;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.sync.ResponseTransformer;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Fault drill 2026-10-30: with the store unreachable a confirm answered 500; every storage call is the retryable 503. */
class S3StorageAdapterTest {
    private final S3Client s3 = mock(S3Client.class);
    private final S3StorageAdapter storage = new S3StorageAdapter(s3, mock(S3Presigner.class), "medical", "AES256", "", 300);
    private final SdkClientException unreachable = SdkClientException.create("Unable to execute HTTP request: Connection refused");

    private static void unavailable(org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
        assertThatThrownBy(call).isInstanceOfSatisfying(ApiException.class, e -> {
            org.assertj.core.api.Assertions.assertThat(e.status()).isEqualTo(503);
            org.assertj.core.api.Assertions.assertThat(e.code()).isEqualTo("STORAGE_UNAVAILABLE");
        });
    }

    @Test void anUnreachableStoreIsUnavailableForEveryCall() {
        when(s3.headObject(any(HeadObjectRequest.class))).thenThrow(unreachable);
        when(s3.putObject(any(PutObjectRequest.class), any(RequestBody.class))).thenThrow(unreachable);
        when(s3.putObjectTagging(any(PutObjectTaggingRequest.class))).thenThrow(unreachable);
        when(s3.deleteObject(any(DeleteObjectRequest.class))).thenThrow(unreachable);
        unavailable(() -> storage.verify("medical/key"));
        unavailable(() -> storage.read("medical/key", 1024));
        unavailable(() -> storage.seal("medical/key", new byte[] {1}, "application/pdf"));
        unavailable(() -> storage.markClean("medical/key"));
        unavailable(() -> storage.delete("medical/key"));
    }

    @Test void aStoreThatFailsMidReadIsUnavailableToo() {
        when(s3.headObject(any(HeadObjectRequest.class))).thenReturn(HeadObjectResponse.builder().contentType("application/pdf").contentLength(8L).build());
        when(s3.getObject(any(GetObjectRequest.class), any(ResponseTransformer.class))).thenThrow(unreachable);
        unavailable(() -> storage.read("medical/key", 1024));
    }
}
