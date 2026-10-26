package cw.auth;

import cw.contracts.ApiException;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;

@Component @Order(1)
public class ApiSecurityFilter extends OncePerRequestFilter {
    public static final int MAX_BODY_BYTES=1_048_576;
    private final AuthService auth;
    private final JsonMapper json;
    private final String origin;
    public final boolean devHttp;
    public ApiSecurityFilter(AuthService auth,JsonMapper json,@Value("${cw.origin}") String origin,@Value("${cw.dev-http:false}") boolean devHttp,Environment env) {
        this.auth=auth; this.json=json; this.origin=origin;
        this.devHttp=devHttp && (env.matchesProfiles("dev") || env.matchesProfiles("test"));
        if(devHttp && !this.devHttp) throw new IllegalStateException("HTTP cookie exception requires dev or test profile");
    }
    public String cookieName() { return devHttp?"cw-admin-dev":"__Host-cw-admin"; }
    public String cookieToken(HttpServletRequest req) {
        if(req.getCookies()!=null) for(var cookie:req.getCookies()) if(cookie.getName().equals(cookieName())) return cookie.getValue();
        return null;
    }
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        response.setHeader("X-Content-Type-Options","nosniff"); response.setHeader("Referrer-Policy","no-referrer");
        response.setHeader("Content-Security-Policy","default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
        try {
            // Match the decoded path segments used by Spring MVC, including matrix-parameter removal.
            // Raw getRequestURI() prefixes permit alternate spellings to bypass this boundary.
            String path=canonicalPath(request);
            if(path.startsWith("/api/admin") || path.startsWith("/api/collector")) response.setHeader("Cache-Control","no-store");
            HttpServletRequest req=request;
            if(!Set.of("GET","HEAD","OPTIONS").contains(req.getMethod())) {
                if(req.getContentLengthLong()>MAX_BODY_BYTES) throw new ApiException(413,"BODY_TOO_LARGE");
                byte[] body=req.getInputStream().readNBytes(MAX_BODY_BYTES+1);
                if(body.length>MAX_BODY_BYTES) throw new ApiException(413,"BODY_TOO_LARGE");
                req=new BufferedRequest(req,body);
            }
            if(path.startsWith("/api/admin/")) {
                boolean login=path.equals("/api/admin/session") && req.getMethod().equals("POST");
                boolean write=!Set.of("GET","HEAD","OPTIONS").contains(req.getMethod());
                if(write && !origin.equals(req.getHeader("Origin"))) throw new ApiException(403,"ORIGIN_REJECTED");
                if(!login) {
                    if(req.getHeader("Authorization")!=null) throw new ApiException(403,"FORBIDDEN");
                    var principal=auth.requireAdmin(cookieToken(req)); req.setAttribute("admin",principal);
                    if(write && !AuthService.matchesHash(req.getHeader("X-CSRF-Token"),principal.csrfHash())) throw new ApiException(403,"CSRF_REJECTED");
                }
            } else if(path.startsWith("/api/collector/") && !path.equals("/api/collector/enroll")) {
                String header=req.getHeader("Authorization");
                if(header==null || !header.startsWith("Bearer ")) throw new ApiException(401,"AUTH_REVOKED");
                req.setAttribute("collector",auth.requireCollector(header.substring(7)));
            }
            chain.doFilter(req,response);
        } catch(ApiException e) {
            writeError(response,e);
        } catch(RuntimeException | ServletException failure) {
            // Authentication failures can happen before MVC's exception advice is entered.
            if(response.isCommitted()) throw failure;
            writeError(response,new ApiException(500,"INTERNAL_ERROR"));
        }
    }
    private static String canonicalPath(HttpServletRequest request) {
        try {
            var path=org.springframework.web.util.ServletRequestPathUtils.parseAndCache(request).pathWithinApplication();
            var canonical=new StringBuilder();
            for(var element:path.elements()) {
                if(element instanceof org.springframework.http.server.PathContainer.PathSegment segment) canonical.append(segment.valueToMatch());
                else canonical.append(element.value());
            }
            return canonical.toString();
        } catch(IllegalArgumentException e) { throw new ApiException(400,"INVALID_REQUEST"); }
    }
    private void writeError(HttpServletResponse response,ApiException e) throws IOException {
        response.setStatus(e.status); response.setContentType("application/json");
        if(e.status==429) response.setHeader("Retry-After","600");
        response.getWriter().write(json.writeValueAsString(Map.of("code",e.code,"message",e.code,"retryable",e.retryable,"details",e.details)));
    }
    private static class BufferedRequest extends HttpServletRequestWrapper {
        private final byte[] body;
        BufferedRequest(HttpServletRequest request,byte[] body) { super(request); this.body=body; }
        @Override public ServletInputStream getInputStream() {
            var input=new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public int read() { return input.read(); }
                @Override public boolean isFinished() { return input.available()==0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException(); }
            };
        }
        @Override public BufferedReader getReader() { return new BufferedReader(new InputStreamReader(getInputStream(),java.nio.charset.StandardCharsets.UTF_8)); }
    }
}
