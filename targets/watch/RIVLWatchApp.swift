import CoreLocation
import HealthKit
import MapKit
import SwiftUI
import WatchConnectivity

struct WatchFix: Codable {
  var lat: Double
  var lng: Double
  var t: Double
  var altitude: Double
  var accuracy: Double
  var hr: Int?
  var segment: Int
}
struct WatchWorkout: Codable {
  var version: Int = 1
  var id: String
  var ownerId: String
  var sport: String
  var startedAt: Double
  var endedAt: Double
  var points: [WatchFix]
  var laps: [Double]
}

final class WorkoutController: NSObject, ObservableObject, HKWorkoutSessionDelegate,
  HKLiveWorkoutBuilderDelegate, CLLocationManagerDelegate, WCSessionDelegate
{
  @Published var owner = ""
  @Published var name = ""
  @Published var state = "idle"
  @Published var message = "Open Devices → Apple Watch on your phone to connect."
  @Published var heartRate: Int?
  @Published var meters: Double = 0
  @Published var started: Date?
  @Published var pending = 0
  @Published var route: [CLLocationCoordinate2D] = []
  let health = HKHealthStore(), location = CLLocationManager()
  var session: HKWorkoutSession?, builder: HKLiveWorkoutBuilder?,
    routeBuilder: HKWorkoutRouteBuilder?
  var workout: WatchWorkout?, last: CLLocation?, segment = 0
  var hrReceived: Date?
  var directory: URL {
    let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("workouts")
    try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    var url = root
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try? url.setResourceValues(values)
    return root
  }
  override init() {
    super.init()
    location.delegate = self
    location.desiredAccuracy = kCLLocationAccuracyBest
    location.distanceFilter = 3
    location.activityType = .fitness
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
    recover()
    updatePending()
  }
  func updatePending() {
    pending =
      ((try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil))
      ?? []).filter { $0.pathExtension == "json" && $0.lastPathComponent != "active.json" }.count
  }
  func recover() {
    let file = directory.appendingPathComponent("active.json")
    if let data = try? Data(contentsOf: file),
      let old = try? JSONDecoder().decode(WatchWorkout.self, from: data)
    {
      workout = old
      owner = old.ownerId
      started = Date(timeIntervalSince1970: old.startedAt / 1000)
      segment = (old.points.last?.segment ?? 0) + 1
      state = "paused"
      message = "Recovered workout. Resume to continue."
    }
  }
  func persist() {
    guard let workout, let data = try? JSONEncoder().encode(workout) else { return }
    do {
      try data.write(to: directory.appendingPathComponent("active.json"), options: .atomic)
    } catch { message = "Workout storage failed. Stop safely and retry." }
  }
  func start(_ sport: String) {
    guard !owner.isEmpty, state == "idle" else { return }
    message = "Requesting workout permission…"
    let read: Set<HKObjectType> = [HKObjectType.quantityType(forIdentifier: .heartRate)!]
    let share: Set<HKSampleType> = [HKObjectType.workoutType(), HKSeriesType.workoutRoute()]
    health.requestAuthorization(toShare: share, read: read) { success, error in
      DispatchQueue.main.async {
        guard success else {
          self.message = error?.localizedDescription ?? "Allow Health access in Settings."
          return
        }
        self.begin(sport, recovery: false)
      }
    }
  }
  func begin(_ sport: String, recovery: Bool) {
    guard location.authorizationStatus != .denied && location.authorizationStatus != .restricted
    else {
      message = "Allow Precise Location in watch Settings."
      return
    }
    if location.authorizationStatus == .notDetermined {
      location.requestWhenInUseAuthorization()
      message = "Allow location, then tap Start again."
      return
    }
    guard location.accuracyAuthorization == .fullAccuracy else {
      message = "Turn on Precise Location for RIVL."
      return
    }
    do {
      let config = HKWorkoutConfiguration()
      config.activityType =
        sport == "ride"
        ? .cycling : sport == "run" ? .running : sport == "hike" ? .hiking : .walking
      config.locationType = .outdoor
      session = try HKWorkoutSession(healthStore: health, configuration: config)
      builder = session!.associatedWorkoutBuilder()
      builder!.dataSource = HKLiveWorkoutDataSource(
        healthStore: health, workoutConfiguration: config)
      session!.delegate = self
      builder!.delegate = self
      routeBuilder = HKWorkoutRouteBuilder(healthStore: health, device: .local())
      let now = Date()
      if !recovery {
        workout = WatchWorkout(
          id: UUID().uuidString.lowercased(), ownerId: owner, sport: sport,
          startedAt: now.timeIntervalSince1970 * 1000, endedAt: now.timeIntervalSince1970 * 1000,
          points: [], laps: [])
        started = now
        segment = 0
        meters = 0
      }
      session!.startActivity(with: now)
      builder!.beginCollection(withStart: now) { ok, error in
        if !ok {
          DispatchQueue.main.async {
            self.message = error?.localizedDescription ?? "Health collection failed."
          }
        }
      }
      state = "recording"
      last = nil
      location.startUpdatingLocation()
      message = "Recording on your watch"
      persist()
    } catch { message = error.localizedDescription }
  }
  func pause() {
    guard state == "recording" else { return }
    session?.pause()
    location.stopUpdatingLocation()
    state = "paused"
    segment += 1
    last = nil
    persist()
  }
  func resume() {
    guard state == "paused", let workout else { return }
    if let session {
      session.resume()
      state = "recording"
      location.startUpdatingLocation()
    } else {
      begin(workout.sport, recovery: true)
    }
  }
  func lap() {
    guard state == "recording", let t = workout?.points.last?.t,
      t > (workout?.laps.last ?? workout?.startedAt ?? t) + 1000
    else { return }
    workout?.laps.append(t)
    persist()
  }
  func finish() {
    guard state == "recording" || state == "paused", var complete = workout else { return }
    location.stopUpdatingLocation()
    complete.endedAt = Date().timeIntervalSince1970 * 1000
    guard complete.points.count >= 2 else {
      message = "Wait for two GPS points before finishing."
      if state == "recording" { location.startUpdatingLocation() }
      return
    }
    do {
      let data = try JSONEncoder().encode(complete)
      let url = directory.appendingPathComponent(complete.id + ".json")
      try data.write(to: url, options: .atomic)
      try? FileManager.default.removeItem(at: directory.appendingPathComponent("active.json"))
      send(url, complete)
      message = "Saved on watch. Import it from Devices on your phone."
      updatePending()
    } catch {
      message = "Couldn’t save the workout. Retry Finish."
      return
    }
    session?.end()
    builder?.endCollection(withEnd: Date()) { ok, error in
      if ok {
        self.builder?.finishWorkout { result, error in
          if let result { self.routeBuilder?.finishRoute(with: result, metadata: nil) { _, _ in } }
        }
      }
    }
    state = "idle"
    workout = nil
    started = nil
    last = nil
  }
  func send(_ url: URL, _ item: WatchWorkout) {
    guard WCSession.default.activationState == .activated else { return }
    if !WCSession.default.outstandingFileTransfers.contains(where: {
      $0.file.metadata?["id"] as? String == item.id
    }) {
      WCSession.default.transferFile(
        url, metadata: ["id": item.id, "ownerId": item.ownerId, "version": 1])
    }
  }
  func retry() {
    for url
      in (try? FileManager.default.contentsOfDirectory(
        at: directory, includingPropertiesForKeys: nil)) ?? []
    {
      guard url.lastPathComponent != "active.json", let data = try? Data(contentsOf: url),
        let item = try? JSONDecoder().decode(WatchWorkout.self, from: data), item.ownerId == owner
      else { continue }
      send(url, item)
    }
    message = "Queued watch workouts for transfer."
  }
  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard state == "recording", workout != nil else { return }
    var accepted: [CLLocation] = []
    for fix in locations {
      guard fix.horizontalAccuracy >= 0 && fix.horizontalAccuracy <= 50,
        abs(fix.timestamp.timeIntervalSinceNow) < 30,
        fix.timestamp.timeIntervalSince1970 * 1000 > (workout?.points.last?.t ?? 0)
      else { continue }
      if let old = last,
        fix.timestamp.timeIntervalSince(old.timestamp) > 0
          && fix.timestamp.timeIntervalSince(old.timestamp) <= 30
      {
        let span = fix.timestamp.timeIntervalSince(old.timestamp)
        let d = fix.distance(from: old)
        let maxSpeed = ["ride":35.0,"run":12.0,"walk":4.0,"hike":6.0][workout!.sport] ?? 12.0
        if d / span > maxSpeed { continue }
        meters += d
      }
      if let old = last, fix.timestamp.timeIntervalSince(old.timestamp) > 30 { segment += 1 }
      last = fix
      workout?.points.append(
        WatchFix(
          lat: fix.coordinate.latitude, lng: fix.coordinate.longitude,
          t: fix.timestamp.timeIntervalSince1970 * 1000, altitude: fix.altitude,
          accuracy: fix.horizontalAccuracy, hr: (hrReceived?.timeIntervalSinceNow ?? -1000) > -15 ? heartRate : nil, segment: segment))
      accepted.append(fix)
      if (workout?.points.count ?? 0) >= 100000 {
        pause()
        message = "Recording limit reached. Finish this workout."
        break
      }
    }
    if !accepted.isEmpty { routeBuilder?.insertRouteData(accepted) { _, _ in } }
    persist()
  }
  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    message = "GPS unavailable. Move outdoors and retry."
  }
  func workoutSession(
    _ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState, date: Date
  ) {
    if toState == .paused {
      DispatchQueue.main.async { if self.state == "recording" { self.pause() } }
    }
  }
  func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    DispatchQueue.main.async {
      self.pause()
      self.message = error.localizedDescription
    }
  }
  func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
  func workoutBuilder(
    _ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>
  ) {
    let type = HKObjectType.quantityType(forIdentifier: .heartRate)!
    guard collectedTypes.contains(type),
      let value = workoutBuilder.statistics(for: type)?.mostRecentQuantity()?.doubleValue(
        for: HKUnit.count().unitDivided(by: .minute()))
    else { return }
    DispatchQueue.main.async { self.heartRate = Int(value.rounded()); self.hrReceived = Date() }
  }
  func context(_ data: [String: Any]) {
    DispatchQueue.main.async {
      if self.state == "idle" {
        self.owner = data["ownerId"] as? String ?? ""
        self.name = data["name"] as? String ?? ""
        self.route = (data["route"] as? [[String: Double]] ?? []).compactMap { p in
          guard let lat = p["lat"], let lng = p["lng"] else { return nil }
          return CLLocationCoordinate2D(latitude: lat, longitude: lng)
        }
        self.message =
          self.owner.isEmpty ? "Connect your athlete from the phone." : "Ready for \(self.name)"
      }
    }
  }
  func session(
    _ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) { context(session.receivedApplicationContext) }
  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any])
  { context(applicationContext) }
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
    guard userInfo["status"] as? String == "imported", let id = userInfo["id"] as? String,
      UUID(uuidString: id) != nil, let owner = userInfo["ownerId"] as? String
    else { return }
    let url = directory.appendingPathComponent(id + ".json")
    if let data = try? Data(contentsOf: url),
      let item = try? JSONDecoder().decode(WatchWorkout.self, from: data), item.ownerId == owner
    {
      try? FileManager.default.removeItem(at: url)
      DispatchQueue.main.async {
        self.updatePending()
        self.message = "Workout imported on your phone."
      }
    }
  }
}

@main struct RIVLWatchApp: App {
  @StateObject var recorder = WorkoutController()
  var body: some Scene {
    WindowGroup {
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          Text("RIVL").font(.headline).foregroundStyle(.orange)
          if recorder.state == "idle" {
            ForEach(["run", "ride", "walk", "hike"], id: \.self) { sport in
              Button("Start \(sport)") { recorder.start(sport) }.disabled(recorder.owner.isEmpty)
            }
          } else {
            if let start = recorder.started {
              Text(start, style: .timer).font(.title2).monospacedDigit()
            }
            Text(String(format: "%.2f km", recorder.meters / 1000)).font(.title2).monospacedDigit()
            Text(recorder.heartRate.map { "\($0) bpm" } ?? "Heart rate —")
            Button(recorder.state == "recording" ? "Pause" : "Resume") {
              recorder.state == "recording" ? recorder.pause() : recorder.resume()
            }
            Button("Mark lap") { recorder.lap() }.disabled(recorder.state != "recording")
            Button("Finish & save") { recorder.finish() }
          }
          if recorder.route.count > 1 {
            Map {
              MapPolyline(coordinates: recorder.route).stroke(.orange, lineWidth: 3)
              UserAnnotation()
            }.frame(height: 160).clipShape(RoundedRectangle(cornerRadius: 12))
            Text("Saved route preview. Follow local signs.").font(.caption)
          }
          Text(recorder.message).font(.caption)
          if recorder.pending > 0 {
            Button("Send \(recorder.pending) saved workouts") { recorder.retry() }
          }
        }.padding()
      }
    }
  }
}
