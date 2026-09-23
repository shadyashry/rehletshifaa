package com.rehletshifaa.document.infrastructure;

import com.rehletshifaa.document.application.DocumentInspectionPort;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

/**
 * clamd INSTREAM client. Only an exact {@code stream: OK} is clean and any {@code FOUND} is malware; an
 * unreachable, erroring or unintelligible scanner is a retryable non-verdict, never clean.
 */
@Component
@ConditionalOnProperty(name="app.storage.scanning-mode",havingValue="clamav")
public class ClamAvDocumentInspector implements DocumentInspectionPort {
    private static final Logger log=LoggerFactory.getLogger(ClamAvDocumentInspector.class);
    private final String host; private final int port; private final int timeout; private final MeterRegistry metrics;
    public ClamAvDocumentInspector(@Value("${app.storage.clamav.host}")String host,@Value("${app.storage.clamav.port:3310}")int port,@Value("${app.storage.clamav.timeout-milliseconds:10000}")int timeout,MeterRegistry metrics){this.host=host;this.port=port;this.timeout=timeout;this.metrics=metrics;}
    @Override public InspectionResult inspect(byte[] content,String ignored){
        String response;
        try(Socket socket=new Socket()){socket.connect(new InetSocketAddress(host,port),timeout);socket.setSoTimeout(timeout);OutputStream out=socket.getOutputStream();out.write("zINSTREAM\0".getBytes(StandardCharsets.US_ASCII));int offset=0;while(offset<content.length){int length=Math.min(8192,content.length-offset);out.write(ByteBuffer.allocate(4).putInt(length).array());out.write(content,offset,length);offset+=length;}out.write(new byte[4]);out.flush();response=new String(socket.getInputStream().readNBytes(2048),StandardCharsets.UTF_8).replace("\0","").trim();}
        catch(IOException e){return record(InspectionResult.unavailable("SCANNER_UNAVAILABLE"),e.getClass().getSimpleName());}
        // FOUND is checked first: a signature name may itself contain "OK".
        if(response.endsWith("FOUND"))return record(new InspectionResult(false,"MALWARE_FOUND"),null);
        if(response.equals("stream: OK"))return record(new InspectionResult(true,"CLEAN"),null);
        if(response.contains("size limit exceeded"))return record(new InspectionResult(false,"SCAN_SIZE_LIMIT"),null);
        return record(InspectionResult.unavailable("SCANNER_ERROR"),"unexpected response");
    }
    private InspectionResult record(InspectionResult result,String cause){
        metrics.counter("document.scan","outcome",result.reasonCode()).increment();
        if(result.retryable())log.warn("Malware scanner gave no verdict ({}: {}); document stays unscanned",result.reasonCode(),cause);
        return result;
    }
}
