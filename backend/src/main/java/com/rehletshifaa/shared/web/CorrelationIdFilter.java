package com.rehletshifaa.shared.web;
import jakarta.servlet.*; import jakarta.servlet.http.*; import org.slf4j.MDC; import org.springframework.core.Ordered; import org.springframework.core.annotation.Order; import org.springframework.stereotype.Component;
import java.io.IOException; import java.util.UUID; import java.util.regex.Pattern;
@Component @Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends GenericFilter {
    private static final Pattern SAFE=Pattern.compile("[A-Za-z0-9._-]{1,64}");
    @Override public void doFilter(ServletRequest req,ServletResponse res,FilterChain chain)throws IOException,ServletException{HttpServletRequest request=(HttpServletRequest)req;HttpServletResponse response=(HttpServletResponse)res;String incoming=request.getHeader("X-Request-ID");String id=incoming!=null&&SAFE.matcher(incoming).matches()?incoming:UUID.randomUUID().toString();request.setAttribute("requestId",id);response.setHeader("X-Request-ID",id);try(MDC.MDCCloseable ignored=MDC.putCloseable("requestId",id)){chain.doFilter(req,res);}}
}

