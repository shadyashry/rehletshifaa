package com.rehletshifaa.document.infrastructure;

import com.rehletshifaa.document.application.DocumentInspectionPort.InspectionResult;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/** Against a scripted clamd on a local socket: only an exact OK is clean, and no verdict is never clean. */
class ClamAvDocumentInspectorTest {
    static final byte[] PDF = "%PDF-1.7 test".getBytes(StandardCharsets.US_ASCII);

    InspectionResult scanWith(String reply) throws Exception {
        try (ServerSocket server = new ServerSocket(0)) {
            Thread clamd = new Thread(() -> {
                try (Socket s = server.accept()) {
                    var in = s.getInputStream();
                    in.readNBytes(10); // zINSTREAM\0
                    while (true) { // length-prefixed chunks, terminated by a zero length
                        byte[] len = in.readNBytes(4);
                        int n = ((len[0] & 0xff) << 24) | ((len[1] & 0xff) << 16) | ((len[2] & 0xff) << 8) | (len[3] & 0xff);
                        if (n == 0) break;
                        in.readNBytes(n);
                    }
                    if (reply != null) s.getOutputStream().write((reply + "\0").getBytes(StandardCharsets.US_ASCII));
                } catch (IOException ignored) { }
            });
            clamd.start();
            var result = new ClamAvDocumentInspector("127.0.0.1", server.getLocalPort(), 2000, new SimpleMeterRegistry()).inspect(PDF, "application/pdf");
            clamd.join(5000);
            return result;
        }
    }

    @Test void exactOkIsClean() throws Exception {
        assertThat(scanWith("stream: OK")).isEqualTo(new InspectionResult(true, "CLEAN", false));
    }

    @Test void aSignatureWhoseNameContainsOkIsStillMalware() throws Exception {
        // Regression: the reply was once tested for "OK" before "FOUND", which read this as clean.
        assertThat(scanWith("stream: Win.Trojan.OKLoader-1 FOUND")).isEqualTo(new InspectionResult(false, "MALWARE_FOUND", false));
    }

    @Test void aScannerErrorIsARetryableNonVerdict() throws Exception {
        var result = scanWith("Can't allocate memory ERROR");
        assertThat(result.clean()).isFalse();
        assertThat(result.retryable()).isTrue();
    }

    @Test void aConnectionClosedWithoutAReplyIsARetryableNonVerdict() throws Exception {
        var result = scanWith(null);
        assertThat(result.clean()).isFalse();
        assertThat(result.retryable()).isTrue();
    }

    @Test void anUnreachableScannerIsUnavailableNotClean() throws Exception {
        int closedPort;
        try (ServerSocket probe = new ServerSocket(0)) { closedPort = probe.getLocalPort(); }
        var result = new ClamAvDocumentInspector("127.0.0.1", closedPort, 2000, new SimpleMeterRegistry()).inspect(PDF, "application/pdf");
        assertThat(result).isEqualTo(new InspectionResult(false, "SCANNER_UNAVAILABLE", true));
    }

    @Test void aSizeLimitRejectionIsPermanentNotRetried() throws Exception {
        assertThat(scanWith("INSTREAM size limit exceeded. ERROR")).isEqualTo(new InspectionResult(false, "SCAN_SIZE_LIMIT", false));
    }
}
