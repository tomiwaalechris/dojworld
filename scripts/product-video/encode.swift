import Foundation
import AVFoundation
import AppKit

// JPEG frames arrive on stdin as a big-endian length followed by image bytes.
let output = URL(fileURLWithPath: CommandLine.arguments[1])
let fps = Int32(CommandLine.arguments[2])!
try? FileManager.default.removeItem(at: output)
let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: 1920, AVVideoHeightKey: 1080,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 7_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoMaxKeyFrameIntervalKey: 60]
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input,
    sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
        kCVPixelBufferWidthKey as String: 1920, kCVPixelBufferHeightKey as String: 1080,
        kCVPixelBufferCGImageCompatibilityKey as String: true,
        kCVPixelBufferCGBitmapContextCompatibilityKey as String: true])
writer.add(input)
guard writer.startWriting() else { fatalError("Cannot start encoder: \(String(describing: writer.error))") }
writer.startSession(atSourceTime: .zero)
let stream = FileHandle.standardInput
func readExactly(_ n: Int) -> Data? {
    var data = Data()
    while data.count < n {
        let chunk = stream.readData(ofLength: n - data.count)
        if chunk.isEmpty { return nil }
        data.append(chunk)
    }
    return data
}
var frame: Int64 = 0
while let header = readExactly(4) {
    let count = header.reduce(0) { ($0 << 8) | Int($1) }
    guard let data = readExactly(count) else { fatalError("Incomplete frame") }
    autoreleasepool {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
            let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fatalError("Invalid JPEG frame") }
        while !input.isReadyForMoreMediaData {
            if writer.status == .failed { fatalError("Encoder failed: \(String(describing: writer.error))") }
            Thread.sleep(forTimeInterval: 0.002)
        }
        var optionalBuffer: CVPixelBuffer?
        guard let pool = adaptor.pixelBufferPool,
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &optionalBuffer) == kCVReturnSuccess,
            let buffer = optionalBuffer else { fatalError("Cannot allocate frame") }
        CVPixelBufferLockBaseAddress(buffer, [])
        let context = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: 1920, height: 1080,
            bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
        context.draw(image, in: CGRect(x: 0, y: 0, width: 1920, height: 1080))
        CVPixelBufferUnlockBaseAddress(buffer, [])
        guard adaptor.append(buffer, withPresentationTime: CMTime(value: frame, timescale: fps)) else {
            fatalError("Cannot append frame: \(String(describing: writer.error))")
        }
        frame += 1
    }
}
writer.endSession(atSourceTime: CMTime(value: frame, timescale: fps))
input.markAsFinished()
let finished = DispatchSemaphore(value: 0)
writer.finishWriting { finished.signal() }
finished.wait()
guard writer.status == .completed else { fatalError("Cannot finish video: \(String(describing: writer.error))") }
print("Encoded \(frame) frames at \(fps) fps")

// Optional original soundtrack is mixed into a shareable H.264/AAC MP4.
if CommandLine.arguments.count > 4 {
    let exported = DispatchSemaphore(value: 0)
    Task.detached {
        do {
            let music = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[3]))
            let silent = AVURLAsset(url: output)
            let duration = try await silent.load(.duration)
            let sourceVideo = try await silent.loadTracks(withMediaType: .video)[0]
            let sourceAudio = try await music.loadTracks(withMediaType: .audio)[0]
            let composition = AVMutableComposition()
            let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
            try videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: sourceVideo, at: .zero)
            let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
            try audioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: sourceAudio, at: .zero)
            let final = URL(fileURLWithPath: CommandLine.arguments[4])
            try? FileManager.default.removeItem(at: final)
            let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality)!
            exporter.shouldOptimizeForNetworkUse = true
            try await exporter.export(to: final, as: .mp4)
            print("Exported \(final.lastPathComponent)")
            exported.signal()
        } catch { fatalError("Audio export failed: \(error)") }
    }
    exported.wait()
}
