package com.rehletshifaa.security;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.shared.api.ApiError;
import jakarta.servlet.*; import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value; import org.springframework.http.MediaType; import org.springframework.security.core.context.SecurityContextHolder; import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken; import org.springframework.stereotype.Component;
import java.io.IOException; import java.time.*; import java.util.List;

/**
 * Rejects a client that exceeds the configured write budget. Counting is delegated to
 * {@link RequestRateLimiter} so the budget is shared across backend instances instead of being
 * enforced once per process.
 *
 * <p>Owner decision 2026-10-29 (deep validation D-11): a signed-in write counts against its user, an anonymous one against
 * its client address, with the same budget. Staff behind one office address no longer throttle each other. The filter runs
 * in the security chain right after the bearer token is verified ({@code SecurityConfig}), so the user is the token's
 * verified subject, never a claim a client made up; a request with a bad token is refused before it is counted.</p>
 */
@Component
public class RateLimitFilter extends GenericFilter {
    private final RequestRateLimiter limiter; private final int requests; private final long windowSeconds; private final boolean trustProxy; private final ObjectMapper json;
    public RateLimitFilter(RequestRateLimiter limiter,@Value("${app.rate-limit.requests:30}")int requests,@Value("${app.rate-limit.window-seconds:60}")long windowSeconds,@Value("${app.rate-limit.trust-proxy:false}")boolean trustProxy,ObjectMapper json){this.limiter=limiter;this.requests=requests;this.windowSeconds=windowSeconds;this.trustProxy=trustProxy;this.json=json;}
    @Override public void doFilter(ServletRequest req,ServletResponse res,FilterChain chain)throws IOException,ServletException{
        HttpServletRequest request=(HttpServletRequest)req;HttpServletResponse response=(HttpServletResponse)res;
        if(!"POST".equals(request.getMethod())&&!"PUT".equals(request.getMethod())){chain.doFilter(req,res);return;}
        if(limiter.count(clientKey(request),windowSeconds)>requests){
            response.setStatus(429);response.setContentType(MediaType.APPLICATION_JSON_VALUE);response.setHeader("Retry-After",Long.toString(windowSeconds));
            String requestId=(String)request.getAttribute("requestId");
            json.writeValue(response.getOutputStream(),new ApiError(Instant.now(),"RATE_LIMIT_EXCEEDED","Too many requests. Please try again shortly.",requestId,List.of()));
            return;}
        chain.doFilter(req,res);}
    /** Whose budget a write spends: the verified user when signed in, otherwise the client address. */
    String clientKey(HttpServletRequest request){
        var auth=SecurityContextHolder.getContext().getAuthentication();
        if(auth instanceof JwtAuthenticationToken jwt&&jwt.getName()!=null)return "user:"+jwt.getName();
        return "ip:"+clientIp(request);}
    private String clientIp(HttpServletRequest request){if(trustProxy){String forwarded=request.getHeader("X-Forwarded-For");if(forwarded!=null&&!forwarded.isBlank())return forwarded.split(",")[0].trim();}return request.getRemoteAddr();}
}
