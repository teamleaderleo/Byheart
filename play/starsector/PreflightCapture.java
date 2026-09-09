package dev.starsector.preflight.cli;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/** Existing PID-bound desktop actions, followed by an observation-only capture. */
public final class PreflightCapture {
    public static void main(String[] args) throws Exception {
        if (args.length != 1 && args.length != 3) throw new IllegalArgumentException("Expected run directory [click|key reviewed-name]");
        Path run = Path.of(args[0]).toRealPath();
        RuntimeProcessIdentity identity = RuntimeProcessIdentity.read(run.resolve("runtime-process.json"));
        if (!identity.attachable()) throw new IllegalStateException("Recorded game is not attachable");
        LinuxDesktopSmokeDriver driver = new LinuxDesktopSmokeDriver();
        driver.attachForObservation(new DesktopSmokeDriver.ProcessTarget(identity.pid(), identity.startedAt()));
        if (args.length == 3) {
            if (args[1].equals("click")) {
                System.out.println(driver.execute(Map.of("kind", "click", "target", args[2]), run));
            } else if (args[1].equals("key")) {
                System.out.println(driver.execute(Map.of("kind", "hold-key", "key", args[2], "durationMillis", 120), run));
            } else throw new IllegalArgumentException("Only existing reviewed click/key controls are accepted");
            Thread.sleep(500);
        }
        System.out.println(driver.execute(Map.of("kind", "capture", "artifacts", List.of("screenshot")), run));
    }
}
