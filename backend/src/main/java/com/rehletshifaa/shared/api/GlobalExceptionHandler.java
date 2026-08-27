package com.rehletshifaa.shared.api;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.*;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import java.time.Instant; import java.util.*;
@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log=LoggerFactory.getLogger(GlobalExceptionHandler.class);
    @ExceptionHandler(ApiException.class) ResponseEntity<ApiError> api(ApiException e,HttpServletRequest request){return response(e.status(),e.code(),e.getMessage(),List.of(),request);}
    @ExceptionHandler(MethodArgumentNotValidException.class) ResponseEntity<ApiError> validation(MethodArgumentNotValidException e,HttpServletRequest request){var errors=e.getBindingResult().getFieldErrors().stream().map(x->new ApiError.FieldError(x.getField(),safeValidationMessage(x.getDefaultMessage()))).toList();return response(400,"VALIDATION_FAILED","The request contains invalid fields",errors,request);}
    @ExceptionHandler(HttpMessageNotReadableException.class) ResponseEntity<ApiError> malformed(HttpServletRequest request){return response(400,"MALFORMED_REQUEST","The request body is invalid",List.of(),request);}
    @ExceptionHandler(Exception.class) ResponseEntity<ApiError> unknown(Exception e,HttpServletRequest request){log.error("Unhandled request failure",e);return response(500,"INTERNAL_ERROR","The request could not be completed",List.of(),request);}
    private ResponseEntity<ApiError> response(int status,String code,String message,List<ApiError.FieldError> errors,HttpServletRequest request){String requestId=(String)request.getAttribute("requestId");return ResponseEntity.status(status).body(new ApiError(Instant.now(),code,message,requestId,errors));}
    private String safeValidationMessage(String value){return value==null?"Invalid value":value.replaceAll("[\r\n]"," ");}
}

