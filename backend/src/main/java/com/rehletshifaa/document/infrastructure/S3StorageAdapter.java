package com.rehletshifaa.document.infrastructure;
import com.rehletshifaa.document.application.StoragePort;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.ResponseTransformer;
import java.time.Duration; import java.util.*; import java.util.stream.Collectors;
@Component @ConditionalOnProperty(name="app.storage.mode",havingValue="s3")
public class S3StorageAdapter implements StoragePort {
    private final S3Client s3; private final S3Presigner presigner; private final String bucket; private final String algorithm; private final String kmsKey; private final long expiry;
    public S3StorageAdapter(S3Client s3,S3Presigner presigner,@Value("${app.storage.bucket}")String bucket,@Value("${app.storage.sse-algorithm:AES256}")String algorithm,@Value("${app.storage.kms-key-id:}")String kmsKey,@Value("${app.storage.presign-expiry-seconds}")long expiry){this.s3=s3;this.presigner=presigner;this.bucket=bucket;this.algorithm=algorithm;this.kmsKey=kmsKey;this.expiry=expiry;}
    @Override public PresignedUpload presign(String key,String type,long bytes){ PutObjectRequest.Builder put=PutObjectRequest.builder().bucket(bucket).key(key).contentType(type).contentLength(bytes).tagging("upload-state=pending"); if("aws:kms".equalsIgnoreCase(algorithm)){put.serverSideEncryption(ServerSideEncryption.AWS_KMS);if(!kmsKey.isBlank())put.ssekmsKeyId(kmsKey);}else if(!algorithm.isBlank()&&!"none".equalsIgnoreCase(algorithm)){put.serverSideEncryption(ServerSideEncryption.AES256);} var signed=presigner.presignPutObject(PutObjectPresignRequest.builder().signatureDuration(Duration.ofSeconds(expiry)).putObjectRequest(put.build()).build()); Map<String,String> headers=signed.signedHeaders().entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey,e->String.join(",",e.getValue()))); return new PresignedUpload(signed.url().toString(),headers,expiry); }
    @Override public StoredObject verify(String key){ try{HeadObjectResponse head=s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());return new StoredObject(head.contentType(),head.contentLength());}catch(NoSuchKeyException e){throw new ApiException(422,"UPLOAD_NOT_FOUND","Uploaded document could not be verified");}catch(S3Exception e){throw new ApiException(503,"STORAGE_UNAVAILABLE","Document storage is temporarily unavailable");} }
    @Override public byte[] read(String key,long maximumBytes){StoredObject metadata=verify(key);if(metadata.sizeBytes()>maximumBytes)throw new ApiException(422,"DOCUMENT_TOO_LARGE_TO_SCAN","Document exceeds the inspection limit");try{ResponseBytes<GetObjectResponse> result=s3.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build(),ResponseTransformer.toBytes());return result.asByteArray();}catch(S3Exception e){throw new ApiException(503,"STORAGE_UNAVAILABLE","Document storage is temporarily unavailable");}}
    @Override public PresignedDownload presignDownload(String key,String safeName){GetObjectRequest get=GetObjectRequest.builder().bucket(bucket).key(key).responseContentDisposition("attachment; filename=\""+safeName.replace("\"","")+"\"").build();var signed=presigner.presignGetObject(GetObjectPresignRequest.builder().signatureDuration(Duration.ofSeconds(expiry)).getObjectRequest(get).build());return new PresignedDownload(signed.url().toString(),expiry);}
    @Override public PresignedDownload presignView(String key,String safeName){GetObjectRequest get=GetObjectRequest.builder().bucket(bucket).key(key).responseContentDisposition("inline; filename=\""+safeName.replace("\"","")+"\"").build();var signed=presigner.presignGetObject(GetObjectPresignRequest.builder().signatureDuration(Duration.ofSeconds(expiry)).getObjectRequest(get).build());return new PresignedDownload(signed.url().toString(),expiry);}
    @Override public void markClean(String key){try{s3.putObjectTagging(PutObjectTaggingRequest.builder().bucket(bucket).key(key).tagging(Tagging.builder().tagSet(Tag.builder().key("upload-state").value("clean").build()).build()).build());}catch(S3Exception e){throw new ApiException(503,"STORAGE_UNAVAILABLE","Document storage is temporarily unavailable");}}
    @Override public void delete(String key){try{s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());}catch(S3Exception e){throw new ApiException(503,"STORAGE_UNAVAILABLE","Document storage is temporarily unavailable");}}
}
