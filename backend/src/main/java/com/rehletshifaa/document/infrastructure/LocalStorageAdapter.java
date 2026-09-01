package com.rehletshifaa.document.infrastructure;
import com.rehletshifaa.document.application.StoragePort;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import java.time.*; import java.util.*; import java.util.concurrent.ConcurrentHashMap;
@Component @ConditionalOnProperty(name="app.storage.mode",havingValue="mock",matchIfMissing=true)
public class LocalStorageAdapter implements StoragePort {
    private final Map<String,Token> tokens=new ConcurrentHashMap<>(); private final Map<String,DownloadToken> downloadTokens=new ConcurrentHashMap<>(); private final Map<String,LocalObject> stored=new ConcurrentHashMap<>(); private final String baseUrl; private final long expiry; private final long maxBytes;
    public LocalStorageAdapter(@Value("${app.public-base-url}")String baseUrl,@Value("${app.storage.presign-expiry-seconds}")long expiry,@Value("${app.storage.max-bytes}")long maxBytes){this.baseUrl=baseUrl;this.expiry=expiry;this.maxBytes=maxBytes;}
    @Override public PresignedUpload presign(String key,String type,long bytes){String token=UUID.randomUUID().toString();tokens.put(token,new Token(key,type,bytes,Instant.now().plusSeconds(expiry)));return new PresignedUpload(baseUrl+"/api/v1/local-uploads/"+token,Map.of("Content-Type",type),expiry);}
    public void upload(String token,String type,byte[] body){Token pending=tokens.remove(token);if(pending==null||Instant.now().isAfter(pending.expiresAt()))throw new ApiException(404,"UPLOAD_TOKEN_INVALID","Upload token is invalid or expired");if(body.length<=0||body.length>maxBytes||body.length!=pending.size()||!pending.type().equalsIgnoreCase(type))throw new ApiException(422,"UPLOAD_METADATA_MISMATCH","Uploaded document metadata does not match the request");stored.put(pending.key(),new LocalObject(type,body.clone(),false));}
    @Override public StoredObject verify(String key){LocalObject value=required(key);return new StoredObject(value.contentType(),value.body().length);}
    @Override public byte[] read(String key,long maximumBytes){LocalObject value=required(key);if(value.body().length>maximumBytes)throw new ApiException(422,"DOCUMENT_TOO_LARGE_TO_SCAN","Document exceeds the inspection limit");return value.body().clone();}
    @Override public PresignedDownload presignDownload(String key,String safeName){LocalObject value=required(key);if(!value.clean())throw new ApiException(403,"DOCUMENT_NOT_CLEAN","Document is not available for download");String token=UUID.randomUUID().toString();downloadTokens.put(token,new DownloadToken(key,Instant.now().plusSeconds(expiry)));return new PresignedDownload(baseUrl+"/api/v1/local-downloads/"+token,expiry);}
    @Override public void markClean(String key){LocalObject value=required(key);stored.put(key,new LocalObject(value.contentType(),value.body(),true));}
    @Override public void delete(String key){stored.remove(key);}
    public Download download(String token){DownloadToken access=downloadTokens.get(token);if(access==null||Instant.now().isAfter(access.expiresAt())){downloadTokens.remove(token);throw new ApiException(404,"DOWNLOAD_TOKEN_INVALID","Download token is invalid or expired");}LocalObject value=required(access.key());if(!value.clean())throw new ApiException(403,"DOCUMENT_NOT_CLEAN","Document is not available for download");return new Download(value.contentType(),value.body().clone());}
    private LocalObject required(String key){LocalObject value=stored.get(key);if(value==null)throw new ApiException(422,"UPLOAD_NOT_FOUND","Uploaded document could not be verified");return value;}
    private record Token(String key,String type,long size,Instant expiresAt){}
    private record DownloadToken(String key,Instant expiresAt){}
    private record LocalObject(String contentType,byte[] body,boolean clean){}
    public record Download(String contentType,byte[] body){}
}
