package com.rehletshifaa.document.infrastructure;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
@Configuration @ConditionalOnProperty(name="app.storage.mode",havingValue="s3")
public class AwsStorageConfig {
    @Bean S3Client s3Client(@Value("${app.storage.region}") String region){return S3Client.builder().region(Region.of(region)).httpClientBuilder(UrlConnectionHttpClient.builder()).build();}
    @Bean S3Presigner s3Presigner(@Value("${app.storage.region}") String region){return S3Presigner.builder().region(Region.of(region)).build();}
}

