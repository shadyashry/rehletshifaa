package com.rehletshifaa.security;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rehletshifaa.shared.api.ApiError;
import jakarta.servlet.*; import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value; import org.springframework.core.Ordered; import org.springframework.core.annotation.Order; import org.springframework.http.MediaType; import org.springframework.stereotype.Component;
import java.io.IOException; import java.time.*; import java.util.List; import java.util.concurrent.ConcurrentHashMap;
@Component @Order(Ordered.HIGHEST_PRECEDENCE+10)
public class RateLimitFilter extends GenericFilter {
    private final ConcurrentHashMap<String,Window> clients=new ConcurrentHashMap<>(); private final int requests; private final long windowSeconds; private final boolean trustProxy; private final ObjectMapper json;
    public RateLimitFilter(@Value("${app.rate-limit.requests:30}")int requests,@Value("${app.rate-limit.window-seconds:60}")long windowSeconds,@Value("${app.rate-limit.trust-proxy:false}")boolean trustProxy,ObjectMapper json){this.requests=requests;this.windowSeconds=windowSeconds;this.trustProxy=trustProxy;this.json=json;}
    @Override public void doFilter(ServletRequest req,ServletResponse res,FilterChain chain)throws IOException,ServletException{HttpServletRequest request=(HttpServletRequest)req;HttpServletResponse response=(HttpServletResponse)res;if(!"POST".equals(request.getMethod())&&!"PUT".equals(request.getMethod())){chain.doFilter(req,res);return;}String key=clientIp(request);long now=Instant.now().getEpochSecond();Window window=clients.compute(key,(k,current)->current==null||now-current.started>=windowSeconds?new Window(now,1):new Window(current.started,current.count+1));if(window.count>requests){response.setStatus(429);response.setContentType(MediaType.APPLICATION_JSON_VALUE);response.setHeader("Retry-After",Long.toString(windowSeconds));String requestId=(String)request.getAttribute("requestId");json.writeValue(response.getOutputStream(),new ApiError(Instant.now(),"RATE_LIMIT_EXCEEDED","Too many requests. Please try again shortly.",requestId,List.of()));return;}if(clients.size()>10000)clients.entrySet().removeIf(e->now-e.getValue().started>windowSeconds);chain.doFilter(req,res);}
    private String clientIp(HttpServletRequest request){if(trustProxy){String forwarded=request.getHeader("X-Forwarded-For");if(forwarded!=null&&!forwarded.isBlank())return forwarded.split(",")[0].trim();}return request.getRemoteAddr();}
    private record Window(long started,int count){}
}

