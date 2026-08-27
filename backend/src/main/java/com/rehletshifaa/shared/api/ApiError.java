package com.rehletshifaa.shared.api;
import java.time.Instant; import java.util.List;
public record ApiError(Instant timestamp,String code,String message,String requestId,List<FieldError> errors){public record FieldError(String field,String message){}}

