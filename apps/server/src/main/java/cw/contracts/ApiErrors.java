package cw.contracts;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<?> api(ApiException e) {
        var response=ResponseEntity.status(e.status); if(e.status==429) response.header("Retry-After","600");
        return response.body(Map.of("code",e.code,"message",e.code,"retryable",e.retryable,"details",e.details));
    }
    @ExceptionHandler({HttpMessageNotReadableException.class,MethodArgumentTypeMismatchException.class,tools.jackson.core.JacksonException.class})
    public ResponseEntity<?> invalid(Exception ignored) { return api(new ApiException(400,"INVALID_REQUEST")); }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> unexpected(Exception failure) {
        if(failure instanceof org.springframework.web.ErrorResponse error && error.getStatusCode().is4xxClientError()) {
            int status=error.getStatusCode().value();
            return api(new ApiException(status,status==404?"NOT_FOUND":"INVALID_REQUEST"));
        }
        // Do not reflect exception messages, SQL values, or submitted identifiers.
        return api(new ApiException(500,"INTERNAL_ERROR"));
    }
    @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
    public ResponseEntity<?> conflict(Exception ignored) { return api(new ApiException(409,"CONFLICT")); }
}
