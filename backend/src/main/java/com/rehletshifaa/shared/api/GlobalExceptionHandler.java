package com.rehletshifaa.shared.api;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.*;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import jakarta.validation.ConstraintViolationException;
import java.time.Instant; import java.util.*;
@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log=LoggerFactory.getLogger(GlobalExceptionHandler.class);
    @ExceptionHandler(ApiException.class) ResponseEntity<ApiError> api(ApiException e,HttpServletRequest request){return response(e.status(),e.code(),e.getMessage(),List.of(),request);}
    @ExceptionHandler(FieldValidationException.class) ResponseEntity<ApiError> fieldValidation(FieldValidationException e,HttpServletRequest request){return response(400,"VALIDATION_FAILED",e.getMessage(),e.errors(),request);}
    @ExceptionHandler(MethodArgumentNotValidException.class) ResponseEntity<ApiError> validation(MethodArgumentNotValidException e,HttpServletRequest request){var errors=e.getBindingResult().getFieldErrors().stream().map(x->new ApiError.FieldError(x.getField(),safeValidationMessage(x.getDefaultMessage()))).toList();return response(400,"VALIDATION_FAILED","The request contains invalid fields",errors,request);}
    @ExceptionHandler(HttpMessageNotReadableException.class) ResponseEntity<ApiError> malformed(HttpServletRequest request){return response(400,"MALFORMED_REQUEST","The request body is invalid",List.of(),request);}
    @ExceptionHandler(MethodArgumentTypeMismatchException.class) ResponseEntity<ApiError> invalidIdentifier(MethodArgumentTypeMismatchException e,HttpServletRequest request){return response(400,"INVALID_IDENTIFIER","A path or query identifier is invalid",List.of(),request);}
    @ExceptionHandler({ServletRequestBindingException.class,ConstraintViolationException.class,HandlerMethodValidationException.class}) ResponseEntity<ApiError> invalidRequest(Exception e,HttpServletRequest request){return response(400,"VALIDATION_FAILED","The request contains invalid fields",List.of(),request);}
    @ExceptionHandler(MaxUploadSizeExceededException.class) ResponseEntity<ApiError> tooLarge(MaxUploadSizeExceededException e,HttpServletRequest request){return response(413,"PAYLOAD_TOO_LARGE","The request payload is too large",List.of(),request);}
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class) ResponseEntity<ApiError> unsupportedMedia(HttpMediaTypeNotSupportedException e,HttpServletRequest request){return response(415,"UNSUPPORTED_MEDIA_TYPE","The request content type is not supported",List.of(),request);}
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class) ResponseEntity<ApiError> unsupportedMethod(HttpRequestMethodNotSupportedException e,HttpServletRequest request){return response(405,"METHOD_NOT_ALLOWED","The request method is not supported",List.of(),request);}
    @ExceptionHandler(NoResourceFoundException.class) ResponseEntity<ApiError> missingRoute(NoResourceFoundException e,HttpServletRequest request){return response(404,"ROUTE_NOT_FOUND","The requested resource was not found",List.of(),request);}
    /** A concurrent writer won (optimistic version, lock wait, deadlock victim): nothing was changed; reload and retry. */
    @ExceptionHandler(org.springframework.dao.ConcurrencyFailureException.class) ResponseEntity<ApiError> concurrentModification(Exception e,HttpServletRequest request){log.info("Concurrent modification rejected: {}",e.getClass().getSimpleName());return response(409,"CONCURRENT_MODIFICATION","The record was changed by another request; reload and try again",List.of(),request);}
    /** The database is unreachable or timed out: a transient outage, not an application defect, and the transaction did not commit. */
    @ExceptionHandler({org.springframework.dao.DataAccessResourceFailureException.class,org.springframework.transaction.CannotCreateTransactionException.class,org.springframework.dao.QueryTimeoutException.class,org.springframework.dao.TransientDataAccessResourceException.class})
    ResponseEntity<ApiError> databaseUnavailable(Exception e,HttpServletRequest request){log.error("Database unavailable: {}",e.getClass().getSimpleName());return ResponseEntity.status(503).header(HttpHeaders.RETRY_AFTER,"5").body(response(503,"SERVICE_UNAVAILABLE","The service is temporarily unavailable; try again shortly",List.of(),request).getBody());}
    @ExceptionHandler(Exception.class) ResponseEntity<ApiError> unknown(Exception e,HttpServletRequest request){log.error("Unhandled request failure",e);return response(500,"INTERNAL_ERROR","The request could not be completed",List.of(),request);}
    private ResponseEntity<ApiError> response(int status,String code,String message,List<ApiError.FieldError> errors,HttpServletRequest request){String requestId=(String)request.getAttribute("requestId");return ResponseEntity.status(status).body(new ApiError(Instant.now(),code,message,requestId,errors));}
    private String safeValidationMessage(String value){return value==null?"Invalid value":value.replaceAll("[\r\n]"," ");}
}
