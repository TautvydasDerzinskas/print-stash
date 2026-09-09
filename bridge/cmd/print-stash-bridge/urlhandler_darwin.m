#import <Cocoa/Cocoa.h>
#include "_cgo_export.h"

@interface PSBridgeAppDelegate : NSObject <NSApplicationDelegate>
@end

@implementation PSBridgeAppDelegate

// Registered in applicationWillFinishLaunching, not applicationDidFinishLaunching: when this
// process is launched *by* a print-stash:// open (the common case -- the app isn't already
// running), the GetURL event carrying that very URL can be dispatched before "did finish" fires,
// and would otherwise be silently dropped. "Will finish" runs early enough to catch it.
- (void)applicationWillFinishLaunching:(NSNotification *)notification {
    NSAppleEventManager *manager = [NSAppleEventManager sharedAppleEventManager];
    [manager setEventHandler:self
                  andSelector:@selector(handleGetURLEvent:withReplyEvent:)
                forEventClass:kInternetEventClass
                   andEventID:kAEGetURL];
}

- (void)handleGetURLEvent:(NSAppleEventDescriptor *)event withReplyEvent:(NSAppleEventDescriptor *)replyEvent {
    NSString *urlString = [[event paramDescriptorForKeyword:keyDirectObject] stringValue];
    if (urlString) {
        goHandleOpenURL((char *)[urlString UTF8String]);
    }
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return NO;
}

@end

void RunURLListener(void) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        [app setActivationPolicy:NSApplicationActivationPolicyAccessory];
        PSBridgeAppDelegate *delegate = [[PSBridgeAppDelegate alloc] init];
        [app setDelegate:delegate];
        [app run];
    }
}
