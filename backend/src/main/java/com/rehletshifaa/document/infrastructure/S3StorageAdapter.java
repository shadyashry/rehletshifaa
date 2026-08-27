package com.rehletshifaa.document.infrastructure;
import com.rehletshifaa.document.application.StoragePort;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;
import java.time.Duration; import java.util.*; import java.util.stream.Collectors;
@Component @ConditionalOnProperty(name="app.storage.mode",havingValue="s3")
public class S3StorageAdapter implements StoragePort {
    private final S3Client s3; private final S3Presigner presigner; private final String bucket; private final String algorithm; private final String kmsKey; private final long expiry;
    public S3StorageAdapter(S3Client s3,S3Presigner presigner,@Value("${app.storage.bucket}")String bucket,@Value("${app.storage.sse-algorithm:AES256}")String algorithm,@Value("${app.storage.kms-key-id:}")String kmsKey,@Value("${app.storage.presign-expiry-seconds}")long expiry){this.s3=s3;this.presigner=presigner;this.bucket=bucket;this.algorithm=algorithm;this.kmsKey=kmsKey;this.expiry=expiry;}
    @Override public PresignedUpload presign(String key,String type,long bytes){ PutObjectRequest.Builder put=PutObjectRequest.builder().bucket(bucket).key(key).contentType(type).contentLength(bytes); if("aws:kms".equalsIgnoreCase(algorithm)){put.serverSideEncryption(ServerSideEncryption.AWS_KMS);if(!kmsKey.isBlank())put.ssekmsKeyId(kmsKey);}else put.serverSideEncryption(ServerSideEncryption.AES256); var signed=presigner.presignPutObject(PutObjectPresignRequest.builder().signatureDuration(Duration.ofSeconds(expiry)).putObjectRequest(put.build()).build()); Map<String,String> headers=signed.signedHeaders().entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey,e->String.join(",",e.getValue()))); return new PresignedUpload(signed.url().toString(),headers,expiry); }
    @Override public StoredObject verify(String key){ try{HeadObjectResponse head=s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());return new StoredObject(head.contentType(),head.contentLength());}catch(NoSuchKeyException e){throw new ApiException(422,"UPLOAD_NOT_FOUND","Uploaded document could not be verified");}catch(S3Exception e){throw new ApiException(503,"STORAGE_UNAVAILABLE","Document storage is temporarily unavailable");} }
}

