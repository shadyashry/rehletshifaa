package com.rehletshifaa.shared.config;
import io.swagger.v3.oas.models.OpenAPI; import io.swagger.v3.oas.models.info.Info; import org.springframework.context.annotation.*;
@Configuration public class OpenApiConfig { @Bean OpenAPI api(){return new OpenAPI().info(new Info().title("RehletShifaa Case API").version("v1").description("Public draft, secure-upload, and submission workflow. No public case lookup is exposed."));} }

